import { inject } from '@angular/core';
import { CanActivateFn, GuardResult, MaybeAsync, Router, UrlTree } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, map, take, Observable } from 'rxjs';
import { AuthService } from '../services/auth.service';

function rutaPorRol(auth: AuthService): string {
  const rol = auth.perfil()?.rol;
  if (rol === 'admin') return '/admin';
  if (rol === 'inventario') return '/inventario';
  return '/catalogo';
}

/**
 * Espera a que AuthService termine de inicializar antes de evaluar la condición.
 * Router se inyecta en el contexto sincrónico del guard (no dentro del observable).
 */
function whenReady(
  auth: AuthService,
  router: Router,
  check: () => true | string
): MaybeAsync<GuardResult> {
  const evaluate = (): true | UrlTree => {
    const result = check();
    return result === true ? true : router.createUrlTree([result]);
  };

  if (!auth.cargando()) return evaluate();

  return toObservable(auth.cargando).pipe(
    filter((c) => !c),
    take(1),
    map((): true | UrlTree => evaluate())
  ) as Observable<GuardResult>;
}

export const landingGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return whenReady(auth, router, () =>
    auth.estaAutenticado() ? rutaPorRol(auth) : true
  );
};

export const invitadoGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return whenReady(auth, router, () =>
    !auth.estaAutenticado() ? true : rutaPorRol(auth)
  );
};

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return whenReady(auth, router, () =>
    auth.estaAutenticado() ? true : '/auth/login'
  );
};

export const catalogoGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return whenReady(auth, router, () => {
    if (!auth.estaAutenticado()) return '/auth/login';
    return auth.perfil()?.rol === 'usuario' ? true : rutaPorRol(auth);
  });
};

export const inventarioGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return whenReady(auth, router, () => {
    if (!auth.estaAutenticado()) return '/auth/login';
    const rol = auth.perfil()?.rol;
    return (rol === 'inventario' || rol === 'admin') ? true : rutaPorRol(auth);
  });
};

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return whenReady(auth, router, () => {
    if (!auth.estaAutenticado()) return '/auth/login';
    return auth.perfil()?.rol === 'admin' ? true : rutaPorRol(auth);
  });
};

/** Guard para /inventario: redirige a /op (portal bodega) si no está autenticado */
export const bodegaGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return whenReady(auth, router, () => {
    if (!auth.estaAutenticado()) return '/op';
    const rol = auth.perfil()?.rol;
    return (rol === 'inventario' || rol === 'admin') ? true : rutaPorRol(auth);
  });
};

/** Guard para /op: si ya está autenticado como operador, va directo a /inventario */
export const invitadoBodegaGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return whenReady(auth, router, () => {
    if (!auth.estaAutenticado()) return true;
    const rol = auth.perfil()?.rol;
    if (rol === 'inventario' || rol === 'admin') return '/inventario';
    return '/catalogo';
  });
};
