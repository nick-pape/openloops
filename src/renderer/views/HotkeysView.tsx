import './HotkeysView.css'

export function HotkeysView() {
  const hotkeys = [
    {
      category: 'Work Mode',
      shortcuts: [
        { keys: 'Ctrl+Shift+W', description: 'Toggle Work Mode window' }
      ]
    },
    {
      category: 'Quick Capture',
      shortcuts: [
        { keys: 'Ctrl+Shift+T', description: 'Quick text capture (Work Mode only)' },
        { keys: 'Ctrl+Shift+S', description: 'Screenshot capture' },
        { keys: 'Ctrl+Shift+R', description: 'Voice recording (Work Mode only)' }
      ]
    },
    {
      category: 'Images',
      shortcuts: [
        { keys: 'Ctrl+Shift+U', description: 'Upload image from file' }
      ]
    }
  ]

  return (
    <div className="hotkeys-view">
      <div className="hotkeys-header">
        <h1>⌨️ Keyboard Shortcuts</h1>
        <p className="hotkeys-subtitle">
          Global hotkeys work system-wide, even when Open Loops is not focused
        </p>
      </div>

      <div className="hotkeys-sections">
        {hotkeys.map((section) => (
          <div key={section.category} className="hotkey-section">
            <h2 className="section-title">{section.category}</h2>
            <div className="hotkey-list">
              {section.shortcuts.map((shortcut) => (
                <div key={shortcut.keys} className="hotkey-item">
                  <div className="hotkey-keys">
                    {shortcut.keys.split('+').map((key, index) => (
                      <span key={index}>
                        <kbd className="hotkey-key">{key}</kbd>
                        {index < shortcut.keys.split('+').length - 1 && (
                          <span className="hotkey-plus">+</span>
                        )}
                      </span>
                    ))}
                  </div>
                  <div className="hotkey-description">{shortcut.description}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="hotkeys-footer">
        <p className="hotkeys-note">
          💡 On macOS, use <kbd>Cmd</kbd> instead of <kbd>Ctrl</kbd>
        </p>
      </div>
    </div>
  )
}
