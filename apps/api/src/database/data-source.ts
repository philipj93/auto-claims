import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './typeorm.config';

// Load .env for standalone scripts (seed, migrations).
config();

export const AppDataSource = new DataSource(buildDataSourceOptions());
