import '../../public/browser-polyfill.js'
import { createApp } from 'vue'
import { pinia } from './store'
import App from './views/sidepanel/SidepanelApp.vue'
import './main.scss'

const app = createApp(App)
app.use(pinia)
app.mount('#app')
