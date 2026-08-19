/// <reference types="astro/client" />

import type PocketBase from 'pocketbase';
import type { AdminStoreContext } from './lib/storeContext';
import type { StoreAccessContext } from './lib/storeTeam';
import type { AdminAppPolicy } from './lib/mobileAdminReleases';

declare global {
  namespace App {
    interface Locals {
      adminAuthPb?: PocketBase;
      adminContext?: AdminStoreContext;
      storeAccessContext?: StoreAccessContext;
      adminAppPolicy?: AdminAppPolicy;
    }
  }
}

export {};
