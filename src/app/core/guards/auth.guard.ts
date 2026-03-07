import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.estaAutenticado()) return true;
  return router.createUrlTree(['/auth/login']);
};

export const invitadoGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.estaAutenticado()) return true;
  return router.createUrlTree(['/catalogo']);
};

export const inventarioGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.estaAutenticado()) return router.createUrlTree(['/auth/login']);
  if (auth.esInventario()) return true;
  return router.createUrlTree(['/catalogo']);
};

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.estaAutenticado()) return router.createUrlTree(['/auth/login']);
  if (auth.esAdmin()) return true;
  return router.createUrlTree(['/catalogo']);
};
