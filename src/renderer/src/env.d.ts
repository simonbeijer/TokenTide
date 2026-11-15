/// <reference types="vite/client" />
import type { TokenTideApi } from '../../shared/api'

declare global {
  interface Window {
    tokentide: TokenTideApi
  }
}
