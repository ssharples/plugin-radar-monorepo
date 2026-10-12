import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

function initReact() {
  console.log('main.tsx: Starting React initialization')
  console.log('window.__JUCE__:', typeof window.__JUCE__, window.__JUCE__)

  try {
    const rootElement = document.getElementById('root')
    console.log('root element:', rootElement)

    if (rootElement) {
      const root = ReactDOM.createRoot(rootElement)
      console.log('ReactDOM root created')

      root.render(
        <React.StrictMode>
          <App />
        </React.StrictMode>,
      )
      console.log('React render called')
    } else {
      console.error('Root element not found!')
      document.body.innerHTML = '<div style="color: white; padding: 20px;">Root element not found!</div>'
    }
  } catch (error) {
    console.error('React initialization error:', error)
    document.body.innerHTML = `<div style="color: white; padding: 20px;">React error: ${error}</div>`
  }
}

// Wait for DOM to be ready before initializing React
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initReact)
} else {
  initReact()
}
