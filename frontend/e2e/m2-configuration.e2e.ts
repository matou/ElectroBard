import { expect, test, type APIResponse, type Locator } from '@playwright/test'

type Tag = { id: string }
type Sound = { id: string; kind: string; name: string; tags: Tag[] }

async function json<T>(response: APIResponse): Promise<T> {
  return await response.json() as T
}

async function addTag(row: Locator, name: string): Promise<void> {
  await row.getByRole('button', { name: '+ tag' }).click()
  await row.locator('.tag-editor-add input').fill(name)
  await row.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(row.getByRole('button', { name: `Remove ${name}` })).toBeVisible()
}

// Run against a fresh compose project; this journey intentionally persists its data.
test('a GM configures Layers and Sets and sees membership before playback', async ({ page, request }) => {
  await expect.poll(async () => (await request.get('/api/layers')).status()).toBe(200)
  await page.goto('/layers-sets')
  await expect(page.getByRole('heading', { name: 'Layers & Sets' })).toBeVisible()
  const outline = page.getByRole('region', { name: 'Outline' })
  await expect(outline.locator(':scope > ul > li > .outline-row .outline-item')).toHaveText(['Music', 'Ambience', 'Sound Effects'])
  await expect(page.locator('.app-nav [aria-disabled="true"]')).toContainText('Session')

  await page.getByRole('button', { name: 'Music', exact: true }).click()
  await page.getByLabel('Name', { exact: true }).fill('Scores')
  await page.getByLabel('Playback mode').selectOption('multiset')
  await page.getByLabel('Volume').fill('55')
  await page.getByRole('button', { name: 'Save configuration' }).click()
  await expect(page.getByRole('status')).toContainText('Saved Layer Scores')
  await page.getByRole('button', { name: 'Move Layer Scores down' }).click()
  await expect(outline.locator(':scope > ul > li > .outline-row .outline-item')).toHaveText(['Ambience', 'Scores', 'Sound Effects'])

  await page.getByRole('button', { name: 'Add Layer' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Extra')
  await page.getByRole('button', { name: 'Save configuration' }).click()
  await expect(page.getByRole('button', { name: 'Extra', exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'Sound Library' }).click()
  await page.getByLabel('Add file').setInputFiles({ name: 'Alpha.wav', mimeType: 'audio/wav', buffer: Buffer.from('RIFF\x24\x00\x00\x00WAVEfmt ') })
  await expect(page.getByRole('row', { name: /Alpha/ })).toBeVisible()
  await page.getByPlaceholder('Paste a YouTube video URL…').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  await page.getByRole('button', { name: /Add YouTube/ }).click()
  await expect(page.getByRole('row', { name: /YouTube|Never Gonna|Untitled/ }).last()).toBeVisible()
  const sounds = await json<Sound[]>(await request.get('/api/sounds'))
  const youtube = sounds.find((sound) => sound.kind === 'youtube')!
  const file = sounds.find((sound) => sound.kind === 'file')!
  expect(youtube).toBeDefined()
  expect(file).toBeDefined()

  const firstTag = await request.post('/api/tags', { data: { name: 'Battle' } })
  const secondTag = await request.post('/api/tags', { data: { name: 'Travel' } })
  expect(firstTag.status()).toBe(201)
  expect(secondTag.status()).toBe(201)
  const battle = (await json<Tag>(firstTag)).id
  const travel = (await json<Tag>(secondTag)).id
  await page.reload()
  const fileRow = page.locator('tbody tr').filter({ hasText: 'Alpha' })
  const youtubeRow = page.locator('tbody tr').filter({ hasText: youtube.name })
  for (const name of ['Battle', 'Travel']) {
    await addTag(fileRow, name)
  }
  await addTag(youtubeRow, 'Travel')
  await expect.poll(async () => (await json<Sound>(await request.get(`/api/sounds/${file.id}`))).tags.map((tag) => tag.id).sort()).toEqual([battle, travel].sort())
  await youtubeRow.getByRole('button', { name: 'Rename' }).click()
  await page.locator('tbody tr input:focus').fill('Zulu')
  await page.locator('tbody tr input:focus').press('Enter')
  await expect(page.locator('tbody tr').filter({ hasText: 'Zulu' })).toBeVisible()

  await page.getByRole('link', { name: 'Layers & Sets' }).click()
  await page.getByRole('button', { name: 'Add Set to Scores' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Journey')
  await page.getByRole('checkbox', { name: 'Battle' }).check()
  await page.getByRole('checkbox', { name: 'Travel' }).check()
  await page.getByRole('checkbox', { name: 'Loop' }).check()
  await page.getByRole('checkbox', { name: 'Shuffle' }).check()
  await page.getByRole('button', { name: 'Save configuration' }).click()
  const membership = page.getByRole('region', { name: 'Resolved membership' })
  await expect(membership.locator('ol li')).toHaveText(['Alpha — Uploaded file', 'Zulu — YouTube'])
  await expect(membership).toContainText('2 Sounds')

  await page.getByRole('button', { name: 'Add Set to Scores' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Empty')
  await page.getByRole('button', { name: 'Save configuration' }).click()
  await expect(membership).toContainText('No Tags selected')
  await page.getByRole('button', { name: 'Move Set Empty up' }).click()
  await page.reload()
  await expect(outline.locator(':scope > ul > li > .outline-row .outline-item')).toHaveText(['Ambience', 'Scores', 'Sound Effects', 'Extra'])
  await expect(page.getByRole('button', { name: 'Move Set Empty up' })).toBeDisabled()
  await page.getByRole('button', { name: 'Scores', exact: true }).click()
  await expect(page.getByLabel('Playback mode')).toHaveValue('multiset')
  await expect(page.getByLabel('Volume')).toHaveValue('55')
  await page.getByRole('button', { name: 'Journey', exact: true }).click()
  await expect(page.getByLabel('Loop')).toBeChecked()
  await expect(page.getByLabel('Shuffle')).toBeChecked()
  await expect(membership.locator('ol li')).toHaveText(['Alpha — Uploaded file', 'Zulu — YouTube'])

  await page.getByRole('link', { name: 'Sound Library' }).click()
  await page.locator('tbody tr').filter({ hasText: 'Alpha' }).getByRole('button', { name: 'Remove Battle' }).click()
  await expect(page.locator('tbody tr').filter({ hasText: 'Alpha' }).getByRole('button', { name: 'Remove Battle' })).toHaveCount(0)
  await page.locator('tbody tr').filter({ hasText: 'Alpha' }).getByRole('button', { name: 'Remove Travel' }).click()
  await expect.poll(async () => (await json<Sound>(await request.get(`/api/sounds/${file.id}`))).tags.length).toBe(0)
  await page.getByRole('link', { name: 'Layers & Sets' }).click()
  await page.getByRole('button', { name: 'Journey', exact: true }).click()
  await page.getByRole('button', { name: 'Refresh' }).click()
  await expect(membership.locator('ol li')).toHaveText(['Zulu — YouTube'])
  await page.getByRole('checkbox', { name: 'Travel' }).uncheck()
  await page.getByLabel('Name', { exact: true }).fill('Journey Revised')
  await page.getByRole('button', { name: 'Save configuration' }).click()
  await expect(membership).toContainText('No matching Sounds')
  await expect(page.getByRole('button', { name: 'Journey Revised', exact: true })).toBeVisible()
  await page.getByRole('checkbox', { name: 'Battle' }).uncheck()
  await page.getByRole('button', { name: 'Save configuration' }).click()
  await expect(membership).toContainText('No Tags selected')

  await page.getByRole('button', { name: 'Delete Set' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete Set' }).click()
  await expect(page.getByRole('button', { name: 'Journey Revised', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Scores', exact: true }).click()
  await page.getByRole('button', { name: 'Delete Layer' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete Layer' }).click()
  await page.reload()
  await expect(outline.locator(':scope > ul > li > .outline-row .outline-item')).toHaveText(['Ambience', 'Sound Effects', 'Extra'])
  expect((await request.get('/api/sounds')).ok()).toBeTruthy()
  expect((await json<Sound[]>(await request.get('/api/sounds'))).length).toBe(2)
  expect((await json<Tag[]>(await request.get('/api/tags'))).length).toBe(2)
})
