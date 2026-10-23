import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { CityStudy } from './CityStudy'
import './study.css'

createRoot(document.getElementById('root')!).render(<StrictMode><CityStudy /></StrictMode>)
