import SiteHeader from '../components/landing/SiteHeader'
import Hero from '../components/landing/Hero'
import Capabilities from '../components/landing/Capabilities'
import StatusShowcase from '../components/landing/StatusShowcase'
import Workflow from '../components/landing/Workflow'
import AboutSection from '../components/landing/AboutSection'
import CtaBanner from '../components/landing/CtaBanner'
import SiteFooter from '../components/landing/SiteFooter'
import { useDocumentTitle } from '../hooks/useUi'

export function Landing() {
  useDocumentTitle('Warranto — Digital Warranty & Bill Manager', { exact: true })

  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />
      <main>
        <Hero />
        <Capabilities />
        <StatusShowcase />
        <Workflow />
        <AboutSection />
        <CtaBanner />
      </main>
      <SiteFooter />
    </div>
  )
}

export default Landing
