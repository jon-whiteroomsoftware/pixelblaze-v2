import { test, expect, type Page, type TestInfo } from '@playwright/test'

const SHOT_DIR = 'e2e/screenshots'

// Screenshot the preview pane, save it under e2e/screenshots/, and attach it to the
// Playwright report so failures/visual checks have artifacts. Returns nothing.
async function shootPreview(page: Page, info: TestInfo, name: string) {
  // Let a couple of animation frames render so the canvas isn't mid-clear.
  await page.waitForTimeout(300)
  const buf = await preview(page).screenshot({ path: `${SHOT_DIR}/${name}.png` })
  await info.attach(name, { body: buf, contentType: 'image/png' })
}

/**
 * Pre-push smoke test — NOT exhaustive. It drives the main UI pathways end to end
 * and asserts they still function: boot, load a 2D demo, change its surface embedding,
 * change brightness, load a 3D demo (recommended map applies, surface control drops
 * away), change the renderer, and create a new user pattern.
 *
 * Selectors lean on accessible names (aria-label / role) which are the stablest
 * handles in this UI; the dropdowns are listbox buttons, demos are left-rail rows.
 */

const editor = (page: Page) => page.getByTestId('editor-pane')
const preview = (page: Page) => page.getByTestId('preview-pane')

// Open a listbox-style dropdown by its aria-label and pick an option by text.
async function selectOption(page: Page, dropdownLabel: string, option: string) {
  await page.getByRole('button', { name: dropdownLabel, exact: true }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

// Click a left-rail pattern/demo row by its (unique) name.
const openFromRail = (page: Page, name: string) =>
  page.getByText(name, { exact: true }).click()

test('main UI pathways still function', async ({ page }, testInfo) => {
  await page.goto('/')

  // --- Boot: app mounts and the live preview canvas is present ---
  await expect(page.locator('#root')).not.toBeEmpty()
  await expect(preview(page).locator('canvas').first()).toBeVisible()
  // Default 2D starter pattern is loaded.
  await expect(editor(page)).toContainText('2D')

  // --- Load a 2D demo ---
  await openFromRail(page, 'Kishimisu')
  await expect(editor(page)).toContainText('Kishimisu')
  await expect(editor(page)).toContainText('read-only') // demos are read-only
  // A 2D pattern exposes the Surface (embedding) dropdown.
  const surface = page.getByRole('button', { name: 'Surface', exact: true })
  await expect(surface).toBeVisible()

  // Visual proof #1: a known pattern renders plausibly on the flat square grid.
  await shootPreview(page, testInfo, '01-pattern-2d-flat')

  // --- Change the surface embedding Flat -> Cylinder ---
  await selectOption(page, 'Surface', 'Cylinder')
  await expect(surface).toHaveText('Cylinder')

  // Visual proof #2: same pattern, layout shape changed (flat grid -> wrapped tube).
  await shootPreview(page, testInfo, '02-pattern-2d-cylinder')

  // --- Change brightness ---
  const brightness = preview(page).getByLabel('Brightness')
  await brightness.fill('0.5')
  await expect(brightness).toHaveValue('0.5')

  // --- Load a 3D demo: recommended map applies, Surface control disappears ---
  await openFromRail(page, 'NebulaSphere')
  await expect(editor(page)).toContainText('NebulaSphere')
  await expect(editor(page)).toContainText('3D')
  await expect(page.getByRole('button', { name: 'Map', exact: true })).toHaveText(/Sphere/)
  await expect(page.getByRole('button', { name: 'Surface', exact: true })).toHaveCount(0)

  // --- Change a setting: renderer Fast -> Precise ---
  await selectOption(page, 'Renderer', 'Precise')
  await expect(page.getByRole('button', { name: 'Renderer', exact: true })).toHaveText('Precise')

  // --- Create a new user pattern: starts from the 2D starter, editable ---
  await page.getByRole('button', { name: 'New pattern', exact: true }).click()
  await expect(editor(page)).toContainText('Untitled Pattern')
  await expect(editor(page)).not.toContainText('read-only')

  // Canvas still rendering after the whole sequence.
  await expect(preview(page).locator('canvas').first()).toBeVisible()
})
