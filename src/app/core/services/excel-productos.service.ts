import { Injectable } from '@angular/core';
import type { Categoria } from '../models/producto.model';

export interface FilaImport {
  // Datos del producto
  nombre: string;
  descripcion?: string;
  sku?: string;
  precio_base: number;       // Pricing 1 — costo proveedor
  precio_sugerido?: number;  // Pricing 2 — precio sugerido de venta
  stock?: number;
  activo: boolean;
  // Categoría
  categoria_id?: string;
  categoriaTexto: string;
  categoriaMatch: boolean;
  // Control UI
  seleccionada: boolean;
}

export interface ResultadoParseo {
  filas: FilaImport[];
  totalLeidas: number;
  omitidas: number;         // filas sin título o sin precio
  inactivas: number;        // filas con Active = 0 (pre-filtradas)
}

/** Columnas del Excel que necesitamos — el resto se ignora */
const COL_TITLE       = 'Title';
const COL_DESCRIPTION = 'Description';
const COL_CATEGORY    = 'Category';
const COL_SKU         = 'SKU';
const COL_PRICING1    = 'Pricing 1';   // costo proveedor
const COL_PRICING2    = 'Pricing 2';   // precio de venta sugerido
const COL_STOCK       = 'Stock';
const COL_ACTIVE      = 'Active';

@Injectable({ providedIn: 'root' })
export class ExcelProductosService {

  /**
   * Lee un archivo .xlsx/.xls y devuelve las filas normalizadas.
   * Solo extrae las columnas relevantes; todo lo demás se descarta.
   * @param file    Archivo Excel
   * @param categorias Lista de categorías para cruzar por nombre/slug
   * @param incluirInactivos Si true, incluye filas con Active=0 (por defecto se omiten)
   */
  async parsear(
    file: File,
    categorias: Categoria[],
    incluirInactivos = false,
  ): Promise<ResultadoParseo> {
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];

    // sheet_to_json extrae solo las columnas que existen → objeto plano
    const rawRows = XLSX.utils.sheet_to_json(ws) as Record<string, any>[];

    let omitidas = 0;
    let inactivas = 0;
    const filas: FilaImport[] = [];

    for (const row of rawRows) {
      // ── Campos obligatorios ──────────────────────────────────────────
      const nombre = this.texto(row[COL_TITLE]);
      if (!nombre) { omitidas++; continue; }

      const precio_base = this.numero(row[COL_PRICING1]);
      if (precio_base <= 0) { omitidas++; continue; }

      // ── Filtro activo ────────────────────────────────────────────────
      const activo = this.numero(row[COL_ACTIVE]) !== 0;
      if (!activo && !incluirInactivos) { inactivas++; continue; }

      // ── Campos opcionales ────────────────────────────────────────────
      const descripcion = this.texto(row[COL_DESCRIPTION]) || undefined;
      const sku         = this.texto(row[COL_SKU]) || undefined;
      const stock       = this.numero(row[COL_STOCK]) || undefined;
      const precio2     = this.numero(row[COL_PRICING2]);

      // ── Categoría ────────────────────────────────────────────────────
      const categoriaTexto = this.texto(row[COL_CATEGORY]);
      const cat = this.buscarCategoria(categoriaTexto, categorias);

      filas.push({
        nombre,
        descripcion,
        sku,
        precio_base,
        precio_sugerido: precio2 > 0 ? precio2 : undefined,
        stock,
        activo,
        categoria_id:    cat?.id,
        categoriaTexto,
        categoriaMatch:  !!cat,
        seleccionada:    true,
      });
    }

    return {
      filas,
      totalLeidas: rawRows.length,
      omitidas,
      inactivas,
    };
  }

  // ── Helpers privados ───────────────────────────────────────────────────────

  private texto(val: unknown): string {
    return String(val ?? '').trim();
  }

  private numero(val: unknown): number {
    const n = Number(val);
    return isNaN(n) ? 0 : n;
  }

  private buscarCategoria(texto: string, categorias: Categoria[]): Categoria | undefined {
    if (!texto) return undefined;
    const lower = texto.toLowerCase();
    return categorias.find(c =>
      c.nombre.toLowerCase() === lower ||
      c.slug.toLowerCase()   === lower,
    );
  }
}
