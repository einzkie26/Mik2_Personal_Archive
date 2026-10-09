import ReactDOM from 'react-dom/client'
import App from './App'
import { usesStableRendering } from './lib/browser'
import './index.css'

// Apply the Safari styles before the first render to avoid a visual flash.
document.documentElement.dataset.renderingMode = usesStableRendering ? 'stable' : 'default'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />,
)
