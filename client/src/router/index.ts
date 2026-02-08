import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('../views/HomePage.vue')
  },
  {
    path: '/classic',
    name: 'classic',
    component: () => import('../views/ClassicMode.vue')
  },
  {
    path: '/conference',
    name: 'conference',
    component: () => import('../views/ConferenceMode.vue')
  }
]

export default createRouter({
  history: createWebHashHistory(),
  routes
})
