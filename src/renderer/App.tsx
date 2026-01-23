import { useState, useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { ProjectView } from './views/ProjectView'
import { PlannerView } from './views/PlannerView'
import { SettingsView } from './views/SettingsView'
import { Project } from '../types'
import './App.css'

type View =
  | { type: 'welcome' }
  | { type: 'project'; projectId: string }
  | { type: 'planner' }
  | { type: 'settings' }

function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [currentView, setCurrentView] = useState<View>({ type: 'welcome' })

  useEffect(() => {
    loadProjects()
  }, [])

  const loadProjects = async () => {
    const allProjects = await window.electron.projects.getAll()
    setProjects(allProjects)
  }

  const handleCreateProject = async (name: string) => {
    const project = await window.electron.projects.create(name)
    setProjects([project, ...projects])
    setCurrentView({ type: 'project', projectId: project.id })
  }

  const handleDeleteProject = async (id: string) => {
    await window.electron.projects.delete(id)
    setProjects(projects.filter(p => p.id !== id))
    if (currentView.type === 'project' && currentView.projectId === id) {
      setCurrentView({ type: 'welcome' })
    }
  }

  return (
    <div className="app">
      <Sidebar
        projects={projects}
        currentView={currentView}
        onSelectProject={(id) => setCurrentView({ type: 'project', projectId: id })}
        onSelectPlanner={() => setCurrentView({ type: 'planner' })}
        onSelectSettings={() => setCurrentView({ type: 'settings' })}
        onCreateProject={handleCreateProject}
      />
      <main className="main-content">
        {currentView.type === 'welcome' && (
          <div className="welcome">
            <h1>🤹‍♂️ Welcome to Open Loops</h1>
            <p>Create a project or open the planner to get started.</p>
          </div>
        )}
        {currentView.type === 'project' && (
          <ProjectView
            projectId={currentView.projectId}
            onDeleteProject={handleDeleteProject}
          />
        )}
        {currentView.type === 'planner' && <PlannerView />}
        {currentView.type === 'settings' && <SettingsView />}
      </main>
    </div>
  )
}

export default App
