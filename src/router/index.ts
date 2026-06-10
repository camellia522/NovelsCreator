import { createRouter, createWebHashHistory } from 'vue-router'
import WelcomeView from '@/views/WelcomeView.vue'
import WorkspaceView from '@/views/WorkspaceView.vue'
import { useProjectStore } from '@/stores/project.store'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'welcome', component: WelcomeView, meta: { requiresProject: false } },
    {
      path: '/workspace',
      name: 'workspace',
      component: WorkspaceView,
      meta: { requiresProject: true }
    },
    {
      path: '/workspace/generate/:chapterId',
      name: 'generation-wizard',
      component: () => import('@/views/GenerationWizardView.vue'),
      props: true,
      meta: { requiresProject: true, fullscreenWizard: true }
    },
    {
      path: '/workspace/world-generator',
      name: 'world-generator',
      component: () => import('@/views/WorldGeneratorView.vue'),
      meta: { requiresProject: true, fullscreenWizard: true }
    },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})

router.beforeEach(async (to) => {
  if (!to.meta.requiresProject) return true
  const project = useProjectStore()
  if (!project.current) {
    await project.refresh()
  }
  if (!project.current) {
    return { name: 'welcome' }
  }
  return true
})

export default router
