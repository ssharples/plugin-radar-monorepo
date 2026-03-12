import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

function initReact() {
  try {
    const rootElement = document.getElementById('root')
    console.log('[main.tsx] Root element found:', !!rootElement)
    console.log('[main.tsx] React version:', React.version)
    console.log('[main.tsx] ReactDOM version:', ReactDOM.version)

    if (rootElement) {
      console.log('[main.tsx] Creating React root...')
      const root = ReactDOM.createRoot(rootElement)

      console.log('[main.tsx] Rendering App...')
      root.render(
        <React.StrictMode>
          <App />
        </React.StrictMode>,
      )
      console.log('[main.tsx] App render complete')
    } else {
      console.error('[main.tsx] Root element not found!')
      document.body.innerHTML = '<div style="color: white; padding: 20px;">Root element not found!</div>'
    }
  } catch (error) {
    console.error('[main.tsx] Fatal error:', error)
    document.body.innerHTML = `<div style="color: white; padding: 20px;">React error: ${error}</div>`
  }
}

// Wait for DOM to be ready before initializing React
if (document.readyState === 'loading') {
  console.log('[main.tsx] Waiting for DOMContentLoaded...')
  document.addEventListener('DOMContentLoaded', initReact)
} else {
  console.log('[main.tsx] DOM already ready, initializing...')
  initReact()
}

console.log('[main.tsx] Script loaded, readyState:', document.readyState)
