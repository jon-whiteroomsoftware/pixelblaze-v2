import { render, screen } from '@testing-library/react'
import { StatusDot } from './StatusDot'

describe('StatusDot', () => {
  it('renders the ok tone green (shared by Controller-connected and compile-good)', () => {
    render(<StatusDot tone="ok" testId="dot" />)
    expect(screen.getByTestId('dot').className).toContain('bg-ok')
  })

  it('renders the working tone as a distinct grey pulse (not the ok green)', () => {
    render(<StatusDot tone="working" testId="dot" />)
    const cls = screen.getByTestId('dot').className
    expect(cls).toContain('animate-pulse')
    expect(cls).not.toContain('bg-ok')
  })

  it('renders the error tone red', () => {
    render(<StatusDot tone="error" testId="dot" />)
    expect(screen.getByTestId('dot').className).toContain('bg-red-400')
  })

  it('forwards extra props (e.g. data-status)', () => {
    render(<StatusDot tone="ok" testId="dot" data-status="good" />)
    expect(screen.getByTestId('dot')).toHaveAttribute('data-status', 'good')
  })
})
