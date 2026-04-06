import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  { path: '/', component: () => import('./views/Home.vue') },
  { path: '/teams', component: () => import('./views/Teams.vue') },
  { path: '/match/setup', component: () => import('./views/MatchSetup.vue') },
  { path: '/match/lineup/:matchId', component: () => import('./views/Lineup.vue'), props: true },
  { path: '/match/live/:matchId', component: () => import('./views/LiveMatch.vue'), props: true },
  { path: '/match/summary/:matchId', component: () => import('./views/MatchSummary.vue'), props: true },
  { path: '/history', component: () => import('./views/History.vue') },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
})
