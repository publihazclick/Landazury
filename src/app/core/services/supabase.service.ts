import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private readonly platformId = inject(PLATFORM_ID);
  private _cliente: SupabaseClient | null = null;

  get cliente(): SupabaseClient {
    if (!this._cliente) {
      const esBrowser = isPlatformBrowser(this.platformId);
      this._cliente = createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
        auth: {
          persistSession: esBrowser,
          detectSessionInUrl: esBrowser,
          autoRefreshToken: esBrowser,
        },
      });
    }
    return this._cliente;
  }
}
