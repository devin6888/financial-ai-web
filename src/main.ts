import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'

// ElMessageBox 是「函数式 API」（ElMessageBox.confirm(...)），不会出现在任何模板里，
// 按需引入插件（unplugin-vue-components + ElementPlusResolver）因此不会为它注入样式。
// 少了这一行，确认框会退化成遮罩层左上角的一个裸 div —— 阶段 21 的「撤销授权」弹框踩到过：
// 它的 CSS 恰好被打进了 ChatView 的懒加载分块，先逛过聊天页才正常，直接进管理页就错位。
import 'element-plus/es/components/message-box/style/css'
import './assets/theme.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
