import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-contacto',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './contacto.component.html',
})
export class ContactoComponent {
  readonly whatsapp = 'https://wa.me/573000000000?text=Hola%2C%20quiero%20saber%20m%C3%A1s%20sobre%20Landazury%20Importaciones';
}
