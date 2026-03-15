import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SchedulerService {

  private apiUrl = 'http://localhost:4000/api/scheduleRCA'; // update to your backend route

  constructor(private http: HttpClient) {}

  scheduleRCA(data: any): Observable<any> {
    return this.http.post(this.apiUrl, data);
  }
}
