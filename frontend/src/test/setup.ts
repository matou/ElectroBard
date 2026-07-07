// Global test setup: register jest-dom's custom matchers (e.g. toBeInTheDocument)
// and reset the DOM between tests so cases stay isolated.
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(cleanup)
