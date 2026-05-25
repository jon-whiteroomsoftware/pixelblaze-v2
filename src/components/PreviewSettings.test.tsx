import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PreviewSettings } from './PreviewSettings'
import { usePreviewStore, previewInitialState } from '@/store/previewStore'

beforeEach(() => {
  usePreviewStore.setState(previewInitialState)
})

describe('PreviewSettings', () => {
  it('renders a gear button', () => {
    render(<PreviewSettings />)
    expect(screen.getByRole('button', { name: /preview settings/i })).toBeInTheDocument()
  })

  it('settings panel is hidden by default', () => {
    render(<PreviewSettings />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('clicking gear opens the settings panel', async () => {
    const user = userEvent.setup()
    render(<PreviewSettings />)
    await user.click(screen.getByRole('button', { name: /preview settings/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('clicking gear again closes the panel', async () => {
    const user = userEvent.setup()
    render(<PreviewSettings />)
    await user.click(screen.getByRole('button', { name: /preview settings/i }))
    await user.click(screen.getByRole('button', { name: /preview settings/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('clicking outside dismisses the panel', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <PreviewSettings />
        <button>outside</button>
      </div>
    )
    await user.click(screen.getByRole('button', { name: /preview settings/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /outside/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('settings panel shows Display section heading', async () => {
    const user = userEvent.setup()
    render(<PreviewSettings />)
    await user.click(screen.getByRole('button', { name: /preview settings/i }))
    expect(screen.getByText('Display')).toBeInTheDocument()
  })

  it('brightness slider updates the store', async () => {
    const user = userEvent.setup()
    render(<PreviewSettings />)
    await user.click(screen.getByRole('button', { name: /preview settings/i }))
    const slider = screen.getByRole('slider', { name: /brightness/i })
    fireEvent.change(slider, { target: { value: '0.5' } })
    expect(usePreviewStore.getState().brightness).toBe(0.5)
  })

  it('glow slider updates the store', async () => {
    const user = userEvent.setup()
    render(<PreviewSettings />)
    await user.click(screen.getByRole('button', { name: /preview settings/i }))
    const slider = screen.getByRole('slider', { name: /glow/i })
    fireEvent.change(slider, { target: { value: '12' } })
    expect(usePreviewStore.getState().grid.glowAmount).toBe(12)
  })

  it('grid size inputs show current rows and cols', async () => {
    const user = userEvent.setup()
    render(<PreviewSettings />)
    await user.click(screen.getByRole('button', { name: /preview settings/i }))
    expect(screen.getByRole('spinbutton', { name: /grid columns/i })).toHaveValue(16)
    expect(screen.getByRole('spinbutton', { name: /grid rows/i })).toHaveValue(16)
  })

  it('clicking OK commits grid size to the store', async () => {
    const user = userEvent.setup()
    render(<PreviewSettings />)
    await user.click(screen.getByRole('button', { name: /preview settings/i }))
    await user.clear(screen.getByRole('spinbutton', { name: /grid columns/i }))
    await user.type(screen.getByRole('spinbutton', { name: /grid columns/i }), '8')
    await user.clear(screen.getByRole('spinbutton', { name: /grid rows/i }))
    await user.type(screen.getByRole('spinbutton', { name: /grid rows/i }), '4')
    await user.click(screen.getByRole('button', { name: /ok/i }))
    const { rows, cols } = usePreviewStore.getState().grid
    expect(cols).toBe(8)
    expect(rows).toBe(4)
  })

  it('pressing Enter in a grid input commits the size', async () => {
    const user = userEvent.setup()
    render(<PreviewSettings />)
    await user.click(screen.getByRole('button', { name: /preview settings/i }))
    await user.clear(screen.getByRole('spinbutton', { name: /grid columns/i }))
    await user.type(screen.getByRole('spinbutton', { name: /grid columns/i }), '10{Enter}')
    expect(usePreviewStore.getState().grid.cols).toBe(10)
  })
})
