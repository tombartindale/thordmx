import { createRouter, createWebHistory } from 'vue-router'
import DevicesView from '../views/DevicesView.vue'
import ProvisionView from '../views/ProvisionView.vue'
import FirmwareView from '../views/FirmwareView.vue'
import SettingsView from '../views/SettingsView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'devices',
      component: DevicesView
    },
    {
      path: '/provision',
      name: 'provision',
      component: ProvisionView
    },
    {
      path: '/firmware',
      name: 'firmware',
      component: FirmwareView
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsView
    }
  ]
})

export default router
