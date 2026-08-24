/// <reference types="astro/client" />

import type PocketBase from 'pocketbase';
import type { AdminStoreContext } from './lib/storeContext';
import type { StoreAccessContext } from './lib/storeTeam';
import type { AdminAppPolicy } from './lib/mobileAdminReleases';
import type { PromoAccessContext } from './lib/promoAccess';

declare global {
  namespace App {
    interface Locals {
      adminAuthPb?: PocketBase;
      adminContext?: AdminStoreContext;
      storeAccessContext?: StoreAccessContext;
      promoAccessContext?: PromoAccessContext;
      adminAppPolicy?: AdminAppPolicy;
    }
  }
}

export {};
