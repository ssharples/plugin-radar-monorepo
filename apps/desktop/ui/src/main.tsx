import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

function initReact() {
  try {
    const rootElement = document.getElementById('root')

    if (rootElement) {
      const root = ReactDOM.createRoot(rootElement)

      root.render(
        <React.StrictMode>
          <App />
        </React.StrictMode>,
      )
    } else {
      document.body.innerHTML = '<div style="color: white; padding: 20px;">Root element not found!</div>'
    }
  } catch (error) {
    document.body.innerHTML = `<div style="color: white; padding: 20px;">React error: ${error}</div>`
  }
}

// Wait for DOM to be ready before initializing React
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initReact)
} else {
  initReact()
}
