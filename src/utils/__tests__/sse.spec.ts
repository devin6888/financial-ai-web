import { describe, expect, it } from 'vitest'

import { SseParser } from '../sse'

describe('SseParser', () => {
  it('解析单帧', () => {
    const parser = new SseParser()
    expect(parser.push('event: delta\ndata: {"text":"你好"}\n\n')).toEqual([
      { event: 'delta', data: '{"text":"你好"}' },
    ])
  })

  it('半帧跨块时等到齐了才吐', () => {
    const parser = new SseParser()
    expect(parser.push('event: del')).toEqual([])
    expect(parser.push('ta\ndata: {"te')).toEqual([])
    expect(parser.push('xt":"a"}\n\n')).toEqual([{ event: 'delta', data: '{"text":"a"}' }])
  })

  it('一帧被拆成两块 data 时按换行拼接', () => {
    const parser = new SseParser()
    expect(parser.push('event: x\ndata: a\ndata: b\n\n')).toEqual([{ event: 'x', data: 'a\nb' }])
  })

  it('注释心跳不产生帧', () => {
    const parser = new SseParser()
    expect(parser.push(': ping\n\n')).toEqual([])
  })

  it('一次收到多帧', () => {
    const parser = new SseParser()
    const frames = parser.push('event: a\ndata: 1\n\nevent: b\ndata: 2\n\n')
    expect(frames.map((f) => f.event)).toEqual(['a', 'b'])
  })

  it('没有 event 行时事件名是 message', () => {
    const parser = new SseParser()
    expect(parser.push('data: hi\n\n')).toEqual([{ event: 'message', data: 'hi' }])
  })

  it('CRLF 与 CR 都当换行', () => {
    const parser = new SseParser()
    expect(parser.push('event: a\r\ndata: 1\r\n\r\n')).toEqual([{ event: 'a', data: '1' }])
  })

  it('flush 收尾没有空行的最后一帧', () => {
    const parser = new SseParser()
    expect(parser.push('event: final\ndata: {}')).toEqual([])
    expect(parser.flush()).toEqual([{ event: 'final', data: '{}' }])
  })

  // 阶段 13 新增 stage 事件；这条守的是「协议向前兼容」：
  // 已部署的旧前端（不认识 stage）遇到它必须原样忽略，而不是抛错或崩掉。
  it('未知事件照常解析但不影响后续帧', () => {
    const parser = new SseParser()
    const frames = parser.push('event: stage\ndata: {"phase":"retrieving"}\n\nevent: delta\ndata: {"text":"好"}\n\n')
    expect(frames.map((f) => f.event)).toEqual(['stage', 'delta'])
  })

  it('空帧与纯空白帧被忽略', () => {
    const parser = new SseParser()
    expect(parser.push('\n\n\n\n')).toEqual([])
  })
})