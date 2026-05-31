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

  it('diffusion slider updates the store', async () => {
    const user = userEvent.setup()
    render(<PreviewSettings />)
    await user.click(screen.getByRole('button', { name: /preview settings/i }))
    const slider = screen.getByRole('slider', { name: /diffusion/i })
    fireEvent.change(slider, { target: { value: '0.3' } })
    expect(usePreviewStore.getState().diffusion).toBe(0.3)
  })

  it('light size slider updates the store', async () => {
    const user = userEvent.setup()
    render(<PreviewSettings />)
    await user.click(screen.getByRole('button', { name: /preview settings/i }))
    const slider = screen.getByRole('slider', { name: /light size/i })
    fireEvent.change(slider, { target: { value: '0.8' } })
    expect(usePreviewStore.getState().lightSize).toBe(0.8)
  })

  it('renderer toggle shows both Fast and Precise options', async () => {
    const user = userEvent.setup()
    render(<PreviewSettings />)
    await user.click(screen.getByRole('button', { name: /preview settings/i }))
    const group = screen.getByRole('radiogroup', { name: /renderer/i })
    expect(group).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Fast' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Precise' })).toBeInTheDocument()
  })

  it('renderer toggle reflects and updates the store fidelity mode', async () => {
    const user = userEvent.setup()
    render(<PreviewSettings />)
    await user.click(screen.getByRole('button', { name: /preview settings/i }))
    // Default on load is the fast (float64) renderer
    expect(screen.getByRole('radio', { name: 'Fast' })).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('radio', { name: 'Precise' }))
    expect(usePreviewStore.getState().fidelity).toBe('fidelity')
    expect(screen.getByRole('radio', { name: 'Precise' })).toHaveAttribute('aria-checked', 'true')
  })

  it('grid size inputs show current rows and cols', async () => {
    const user = userEvent.setup()
    render(<PreviewSettings />)
    await user.click(screen.getByRole('button', { name: /preview settings/i }))
    expect(screen.getByRole('spinbutton', { name: /grid columns/i })).toHaveValue(32)
    expect(screen.getByRole('spinbutton', { name: /grid rows/i })).toHaveValue(32)
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

  it('clamps an oversized grid entry to 256 on commit', async () => {
    const user = userEvent.setup()
    render(<PreviewSettings />)
    await user.click(screen.getByRole('button', { name: /preview settings/i }))
    await user.clear(screen.getByRole('spinbutton', { name: /grid columns/i }))
    await user.type(screen.getByRole('spinbutton', { name: /grid columns/i }), '99999')
    await user.click(screen.getByRole('button', { name: /ok/i }))
    expect(usePreviewStore.getState().grid.cols).toBe(256)
    // Draft input is corrected to the clamped value too
    expect(screen.getByRole('spinbutton', { name: /grid columns/i })).toHaveValue(256)
  })
})
