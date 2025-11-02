/// <reference types="svelte" />
/// <reference types="vite/client" />

declare global {
  type FormAccountUpdateResult = {
    errorMessage?: string
    errorFields?: string[]
    fullName?: string
    companyName?: string
    website?: string
    email?: string
  }
  
  namespace svelteHTML {
    interface HTMLAttributes<T> {
      [key: string]: any;
    }
  }
}

export {}
