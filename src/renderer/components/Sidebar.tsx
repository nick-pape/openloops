import { useState } from 'react'
import { Project } from '../../types'
import { useJobs } from '../contexts/JobsContext'
import './Sidebar.css'

interface SidebarProps {
  projects: Project[]
  currentView: { type: string; projectId?: string }
  onSelectProject: (id: string) => void
  onSelectPlanner: () => void
  onSelectJobs: () => void
  onSelectSettings: () => void
  onCreateProject: (name: string) => void
}

export function Sidebar({
  projects,
  currentView,
  onSelectProject,
  onSelectPlanner,
  onSelectJobs,
  onSelectSettings,
  onCreateProject
}: SidebarProps) {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const { pendingCount } = useJobs()

  const handleCreate = () => {
    if (newProjectName.trim()) {
      onCreateProject(newProjectName.trim())
      setNewProjectName('')
      setShowCreateModal(false)
    }
  }

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>🤹‍♂️ Open Loops</h2>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-header">
            <h3>Projects</h3>
            <button
              className="icon-button"
              onClick={() => setShowCreateModal(true)}
              title="New Project"
            >
              +
            </button>
          </div>
          <div className="sidebar-items">
            {projects.map((project) => (
              <button
                key={project.id}
                className={`sidebar-item ${
                  currentView.type === 'project' && currentView.projectId === project.id
                    ? 'active'
                    : ''
                }`}
                onClick={() => onSelectProject(project.id)}
              >
                {project.name}
              </button>
            ))}
            {projects.length === 0 && (
              <div className="sidebar-empty">No projects yet</div>
            )}
          </div>
        </div>

        <div className="sidebar-section">
          <h3>Tools</h3>
          <div className="sidebar-items">
            <button
              className={`sidebar-item ${currentView.type === 'planner' ? 'active' : ''}`}
              onClick={onSelectPlanner}
            >
              Today Planner
            </button>
            <button
              className={`sidebar-item ${currentView.type === 'jobs' ? 'active' : ''}`}
              onClick={onSelectJobs}
            >
              <span>AI Jobs</span>
              {pendingCount > 0 && (
                <span className="badge">{pendingCount}</span>
              )}
            </button>
            <button
              className={`sidebar-item ${currentView.type === 'settings' ? 'active' : ''}`}
              onClick={onSelectSettings}
            >
              Settings
            </button>
          </div>
        </div>
      </aside>

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>New Project</h2>
            <div className="form-group">
              <label>Project Name</label>
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                autoFocus
                placeholder="Enter project name"
              />
            </div>
            <div className="modal-actions">
              <button className="secondary" onClick={() => setShowCreateModal(false)}>
                Cancel
              </button>
              <button onClick={handleCreate} disabled={!newProjectName.trim()}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
