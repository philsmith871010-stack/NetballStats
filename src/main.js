import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router.js'
import './styles.css'

const pinia = createPinia()

// Persist pinia stores to localStorage
pinia.use(({ store }) => {
  const saved = localStorage.getItem(`netball-${store.$id}`)
  if (saved) {
    store.$patch(JSON.parse(saved))
  }
  store.$subscribe((_, state) => {
    localStorage.setItem(`netball-${store.$id}`, JSON.stringify(state))
  })
})

createApp(App).use(pinia).use(router).mount('#app')
