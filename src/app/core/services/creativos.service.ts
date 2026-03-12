import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import type { Creativo, TipoCreativo } from '../models/producto.model';

const BUCKET = 'creativos';

function detectarTipo(file: File): TipoCreativo {
  const mime = file.type;
  if (mime.startsWith('image/')) return 'imagen';
  if (mime.startsWith('video/')) return 'video';
  if (mime === 'application/pdf') return 'pdf';
  if (
    mime === 'application/msword' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime === 'application/vnd.ms-excel' ||
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mime === 'application/vnd.ms-powerpoint' ||
    mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  )
    return 'documento';
  return 'otro';
}

function extension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? '';
}

@Injectable({ providedIn: 'root' })
export class CreativosService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  async subirCreativo(
    file: File,
    opts: { nombre: string; descripcion?: string; productoId?: string; publico?: boolean }
  ): Promise<Creativo> {
    const usuario = this.auth.usuario();
    if (!usuario) throw new Error('Debes iniciar sesión');

    const tipo = detectarTipo(file);

    // Comprimir imágenes antes de subir
    const archivoFinal = tipo === 'imagen' ? await this.comprimirImagen(file, 1600, 0.85) : file;
    const ext = extension(archivoFinal.name);
    const path = `${usuario.id}/${Date.now()}_${archivoFinal.name.replace(/\s+/g, '_')}`;

    const { error: uploadError } = await this.supabase.cliente.storage
      .from(BUCKET)
      .upload(path, archivoFinal, { upsert: false, contentType: archivoFinal.type });
    if (uploadError) throw uploadError;

    const { data: urlData } = this.supabase.cliente.storage.from(BUCKET).getPublicUrl(path);

    const { data, error } = await this.supabase.cliente
      .from('creativos')
      .insert({
        nombre: opts.nombre,
        descripcion: opts.descripcion ?? null,
        tipo,
        archivo_url: urlData.publicUrl,
        archivo_path: path,
        tamano: archivoFinal.size,
        extension: ext,
        producto_id: opts.productoId ?? null,
        subido_por: usuario.id,
        publico: opts.publico ?? true,
      })
      .select()
      .single();

    if (error) throw error;
    return data as Creativo;
  }

  async obtenerCreativos(filtros?: { productoId?: string; tipo?: TipoCreativo }): Promise<Creativo[]> {
    let query = this.supabase.cliente
      .from('creativos')
      .select('*')
      .order('creado_en', { ascending: false });

    if (filtros?.productoId) query = query.eq('producto_id', filtros.productoId);
    if (filtros?.tipo) query = query.eq('tipo', filtros.tipo);

    const { data, error } = await query;
    if (error) throw error;
    return data as Creativo[];
  }

  async obtenerUrlDescarga(path: string): Promise<string> {
    const { data, error } = await this.supabase.cliente.storage
      .from(BUCKET)
      .createSignedUrl(path, 3600); // 1 hora
    if (error) throw error;
    return data.signedUrl;
  }

  async actualizarCreativo(id: string, cambios: Partial<Pick<Creativo, 'nombre' | 'descripcion' | 'producto_id' | 'publico'>>) {
    const { error } = await this.supabase.cliente
      .from('creativos')
      .update(cambios)
      .eq('id', id);
    if (error) throw error;
  }

  async eliminarCreativo(id: string, path: string) {
    const { error: storageError } = await this.supabase.cliente.storage
      .from(BUCKET)
      .remove([path]);
    if (storageError) throw storageError;

    const { error } = await this.supabase.cliente.from('creativos').delete().eq('id', id);
    if (error) throw error;
  }

  async comprimirImagen(file: File, maxPx = 1600, calidad = 0.85): Promise<File> {
    return new Promise((resolve) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        try {
          let { width, height } = img;
          if (width > maxPx || height > maxPx) {
            if (width >= height) { height = Math.round((height * maxPx) / width); width = maxPx; }
            else { width = Math.round((width * maxPx) / height); height = maxPx; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) { resolve(file); return; }
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              if (!blob || blob.size >= file.size) { resolve(file); return; }
              resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
            },
            'image/jpeg', calidad
          );
        } catch { resolve(file); }
      };
      img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
      img.src = objectUrl;
    });
  }

  formatearTamano(bytes?: number): string {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  iconoTipo(tipo: TipoCreativo): string {
    const iconos: Record<TipoCreativo, string> = {
      imagen: '🖼️',
      video: '🎬',
      pdf: '📄',
      documento: '📝',
      otro: '📦',
    };
    return iconos[tipo];
  }
}
