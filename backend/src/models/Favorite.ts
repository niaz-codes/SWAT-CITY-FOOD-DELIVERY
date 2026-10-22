import { defineModel } from '../db/model';

export interface Favorite {
  _id: string;

  user: string;
  kind: string;
  refId: string;

  createdAt: Date;
  updatedAt: Date;
}

export const FavoriteModel = defineModel<Favorite>({
  table: 'favorites',
  columns: ['user', 'kind', 'refId', 'createdAt', 'updatedAt'],
});
