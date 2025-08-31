import { createApp } from 'vue'
import { pinia } from './store'
import App from './apps/sidepanel/SidepanelApp.vue'
import './main.scss'

const app = createApp(App)
app.use(pinia)
app.mount('#app')
