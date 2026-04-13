import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    // Ruta secreta — no pre-renderizar (solo render en cliente al visitarla)
    path: 'dev-access-x7k9p2',
    renderMode: RenderMode.Client,
  },
  {
    // Zona privada de subidores — no pre-renderizar
    path: 'zona-bodega-7k3m9n',
    renderMode: RenderMode.Client,
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender
  }
];
