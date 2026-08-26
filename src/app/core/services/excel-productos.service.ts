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
  // Imagen y creativos
  imagen_url?: string;       // URL imagen principal
  link_creativos?: string;   // URL carpeta de creativos en Drive
  // Dimensiones (uso interno Mipaquete; opcionales — si vienen vacías se aplican
  // defaults por categoría al insertar). Acepta tanto Height/Width/Length/Weight (kg)
  // como Alto/Ancho/Largo/Peso (kg) en español.
  alto_cm?: number;
  ancho_cm?: number;
  largo_cm?: number;
  peso_kg?: number;
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
const COL_IMAGEN_URL  = 'Image URL';   // URL imagen principal
const COL_CREATIVOS   = 'Creativos Drive'; // URL carpeta Drive de creativos
// Dimensiones del paquete — opcional. Acepta nombres en inglés y en español.
const COLS_ALTO   = ['Height (cm)', 'Height', 'Alto (cm)', 'Alto'];
const COLS_ANCHO  = ['Width (cm)',  'Width',  'Ancho (cm)', 'Ancho'];
const COLS_LARGO  = ['Length (cm)', 'Length', 'Largo (cm)', 'Largo'];
const COLS_PESO   = ['Weight (kg)', 'Weight', 'Peso (kg)',  'Peso'];

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
      const descripcion    = this.texto(row[COL_DESCRIPTION]) || undefined;
      const sku            = this.texto(row[COL_SKU]) || undefined;
      const stock          = this.numero(row[COL_STOCK]) || undefined;
      const precio2        = this.numero(row[COL_PRICING2]);
      const imagen_url     = this.texto(row[COL_IMAGEN_URL]) || undefined;
      const link_creativos = this.texto(row[COL_CREATIVOS]) || undefined;

      // ── Dimensiones (opcionales) ────────────────────────────────────
      const alto_cm  = this.primerNumero(row, COLS_ALTO);
      const ancho_cm = this.primerNumero(row, COLS_ANCHO);
      const largo_cm = this.primerNumero(row, COLS_LARGO);
      const peso_kg  = this.primerNumero(row, COLS_PESO);

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
        imagen_url,
        link_creativos,
        alto_cm:  alto_cm  > 0 ? alto_cm  : undefined,
        ancho_cm: ancho_cm > 0 ? ancho_cm : undefined,
        largo_cm: largo_cm > 0 ? largo_cm : undefined,
        peso_kg:  peso_kg  > 0 ? peso_kg  : undefined,
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
    if (val == null) return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    // Tolerar textos con comas decimales o sufijos como "0,8 kg" / "20cm"
    const limpio = String(val).replace(/,/g, '.').replace(/[^0-9.\-]/g, '');
    const n = Number(limpio);
    return isNaN(n) ? 0 : n;
  }

  /** Devuelve el primer valor numérico encontrado entre los nombres alternativos. */
  private primerNumero(row: Record<string, any>, keys: string[]): number {
    for (const k of keys) {
      if (k in row) {
        const n = this.numero(row[k]);
        if (n > 0) return n;
      }
    }
    return 0;
  }

  private buscarCategoria(texto: string, categorias: Categoria[]): Categoria | undefined {
    if (!texto) return undefined;
    const normalizado = this.normalizar(texto);
    return categorias.find(c =>
      this.normalizar(c.nombre) === normalizado ||
      this.normalizar(c.slug)   === normalizado,
    );
  }

  private normalizar(texto: string): string {
    return texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[\s\-_]+/g, '')
      .trim();
  }
}
