/// <reference types="astro/client" />

import type PocketBase from 'pocketbase';
import type { AdminStoreContext } from './lib/storeContext';
import type { StoreAccessContext } from './lib/storeTeam';

declare global {
  namespace App {
    interface Locals {
      adminAuthPb?: PocketBase;
      adminContext?: AdminStoreContext;
      storeAccessContext?: StoreAccessContext;
    }
  }
}

export {};
