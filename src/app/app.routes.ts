import { Routes } from '@angular/router';
import {
  authGuard, invitadoGuard, inventarioGuard, adminGuard,
  landingGuard, catalogoGuard, bodegaGuard, invitadoBodegaGuard,
} from './core/guards/auth.guard';
import { DashboardLayoutComponent } from './shared/components/dashboard-layout/dashboard-layout.component';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [landingGuard],
    loadComponent: () =>
      import('./features/home/home.component').then((m) => m.HomeComponent),
  },
  {
    path: 'auth',
    children: [
      {
        path: 'login',
        loadComponent: () =>
          import('./features/auth/login/login.component').then((m) => m.LoginComponent),
        canActivate: [invitadoGuard],
      },
      {
        path: 'registro',
        loadComponent: () =>
          import('./features/auth/registro/registro.component').then((m) => m.RegistroComponent),
        canActivate: [invitadoGuard],
      },
      { path: '', redirectTo: 'login', pathMatch: 'full' },
    ],
  },
  {
    path: 'op',
    loadComponent: () =>
      import('./features/auth/bodega/bodega.component').then((m) => m.BodegaComponent),
    canActivate: [invitadoBodegaGuard],
  },
  {
    // Ruta secreta de acceso rápido para pruebas internas
    path: 'dev-access-x7k9p2',
    loadComponent: () =>
      import('./features/dev/acceso-rapido.component').then((m) => m.AccesoRapidoComponent),
  },
  {
    // Zona privada para los subidores de productos.
    // Sirve como ruta interna de la app, pero se expone al usuario
    // final mediante el subdominio tienda-lz.vercel.app que re-escribe
    // a esta ruta vía vercel.json.
    path: 'bodega-privada',
    loadComponent: () =>
      import('./features/bodega-privada/bodega-privada-layout.component').then(
        (m) => m.BodegaPrivadaLayoutComponent
      ),
    canActivate: [bodegaGuard],
  },
  {
    path: 'terminos',
    loadComponent: () =>
      import('./features/legal/terminos/terminos.component').then((m) => m.TerminosComponent),
  },
  {
    path: 'privacidad',
    loadComponent: () =>
      import('./features/legal/privacidad/privacidad.component').then((m) => m.PrivacidadComponent),
  },
  {
    path: 'contacto',
    loadComponent: () =>
      import('./features/legal/contacto/contacto.component').then((m) => m.ContactoComponent),
  },
  {
    path: '',
    component: DashboardLayoutComponent,
    canActivate: [authGuard],
    children: [
      {
        path: 'catalogo',
        canActivate: [catalogoGuard],
        loadComponent: () =>
          import('./features/catalogo/catalogo.component').then((m) => m.CatalogoComponent),
      },
      {
        path: 'wallet',
        canActivate: [catalogoGuard],
        loadComponent: () =>
          import('./features/wallet/wallet.component').then((m) => m.WalletComponent),
      },
      {
        path: 'mis-pedidos',
        canActivate: [catalogoGuard],
        loadComponent: () =>
          import('./features/pedidos/mis-pedidos.component').then((m) => m.MisPedidosComponent),
      },
      {
        path: 'integraciones',
        canActivate: [catalogoGuard],
        loadComponent: () =>
          import('./features/integraciones/integraciones.component').then((m) => m.IntegracionesComponent),
      },
      {
        path: 'mis-ganancias',
        canActivate: [catalogoGuard],
        loadComponent: () =>
          import('./features/ganancias/ganancias.component').then((m) => m.GananciasComponent),
      },
      {
        path: 'admin-pedidos',
        canActivate: [inventarioGuard],
        loadComponent: () =>
          import('./features/pedidos/admin-pedidos.component').then((m) => m.AdminPedidosComponent),
      },
      {
        path: 'perfil',
        loadComponent: () =>
          import('./features/perfil/perfil.component').then((m) => m.PerfilComponent),
      },
      {
        path: 'recomienda',
        loadComponent: () =>
          import('./features/referidos/recomienda.component').then((m) => m.RecomiendaComponent),
      },
      {
        path: 'mi-whatsapp',
        loadComponent: () =>
          import('./features/whatsapp/mi-whatsapp.component').then((m) => m.MiWhatsappComponent),
      },
      {
        path: 'inventario',
        canActivate: [bodegaGuard],
        loadComponent: () =>
          import('./features/inventario/inventario.component').then((m) => m.InventarioComponent),
      },
      {
        path: 'admin',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/admin/admin.component').then((m) => m.AdminComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
