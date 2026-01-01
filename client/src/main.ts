import { createApp } from 'vue'
import VueFullscreen from 'vue-fullscreen'
import './style.css'
import App from './App.vue'

const app = createApp(App)
app.use(VueFullscreen)
app.mount('#app')
