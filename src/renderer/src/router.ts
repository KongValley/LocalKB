import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import { store } from './store'
import AboutPage from './views/AboutPage.vue'
import AiPage from './views/AiPage.vue'
import DailyPage from './views/DailyPage.vue'
import GraphPage from './views/GraphPage.vue'
import HomePage from './views/HomePage.vue'
import NotesPage from './views/NotesPage.vue'
import SearchPage from './views/SearchPage.vue'
import TagDetailPage from './views/TagDetailPage.vue'
import TagsPage from './views/TagsPage.vue'
import TodosPage from './views/TodosPage.vue'
import TrashPage from './views/TrashPage.vue'
import WelcomePage from './views/WelcomePage.vue'

// file:// 下 history 模式不可用，必须 Hash
const routes: RouteRecordRaw[] = [
  { path: '/welcome', name: 'welcome', component: WelcomePage },
  { path: '/', name: 'home', component: HomePage },
  { path: '/notes', name: 'notes', component: NotesPage },
  { path: '/search', name: 'search', component: SearchPage },
  { path: '/daily', name: 'daily', component: DailyPage },
  { path: '/tags', name: 'tags', component: TagsPage },
  { path: '/tags/:tag', name: 'tag-detail', component: TagDetailPage },
  { path: '/todos', name: 'todos', component: TodosPage },
  { path: '/graph', name: 'graph', component: GraphPage },
  { path: '/ai', name: 'ai', component: AiPage },
  { path: '/about', name: 'about', component: AboutPage },
  { path: '/trash', name: 'trash', component: TrashPage },
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({ history: createWebHashHistory(), routes })

// 当前文件夹仅来自 /notes?vault=…&dir=…，其他页面一律视为未筛选
router.afterEach((to) => {
  const vaultId = typeof to.query.vault === 'string' && to.query.vault ? to.query.vault : null
  const dir = typeof to.query.dir === 'string' ? to.query.dir : ''
  store.activeFolder = to.path === '/notes' && vaultId ? { vaultId, dir } : null
})

export default router
