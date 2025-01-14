// test/vertexSchemaToZod.test.ts
import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';
import { SchemaType, VertexSchema } from '../src/vertex-schema';
import { zodToVertexSchema } from '../src/zod-to-vertex-schema';
import { vertexSchemaToZod } from '../src/vertex-schema-to-zod';

describe('vertexSchemaToZod', () => {
  describe('Basic Types', () => {
    it('should convert STRING with format="date-time" to z.string().datetime()', () => {
      const input: VertexSchema = {
        type: SchemaType.STRING,
        format: 'date-time',
        description: 'A datetime string',
      };
      const zodSchema = vertexSchemaToZod(input);
      expect(zodSchema).toBeInstanceOf(z.ZodString);

      // Check metadata
      expect(zodSchema._def.description).toBe('A datetime string');

      // Ensure it does produce a .datetime() check
      const result = zodSchema.safeParse(new Date().toISOString());
      expect(result.success).toBe(true);
    });

    it('should convert STRING with no enum/format to z.string()', () => {
      const input: VertexSchema = {
        type: SchemaType.STRING,
        description: 'Just a plain string',
      };
      const zodSchema = vertexSchemaToZod(input);
      expect(zodSchema).toBeInstanceOf(z.ZodString);
      expect(zodSchema._def.description).toBe('Just a plain string');
      const result = zodSchema.safeParse('hello');
      expect(result.success).toBe(true);
    });

    it('should convert BOOLEAN to z.boolean()', () => {
      const input: VertexSchema = {
        type: SchemaType.BOOLEAN,
        description: 'A boolean value',
      };
      const zodSchema = vertexSchemaToZod(input);
      expect(zodSchema).toBeInstanceOf(z.ZodBoolean);
      expect(zodSchema._def.description).toBe('A boolean value');
    });

    it('should convert NUMBER with minimum & maximum to z.number().min().max()', () => {
      const input: VertexSchema = {
        type: SchemaType.NUMBER,
        description: 'A floating-point number',
        minimum: 1.5,
        maximum: 3.2,
      };
      const zodSchema = vertexSchemaToZod(input);
      expect(zodSchema).toBeInstanceOf(z.ZodNumber);
      expect(zodSchema._def.description).toBe('A floating-point number');

      // Check .safeParse
      expect(zodSchema.safeParse(1).success).toBe(false);
      expect(zodSchema.safeParse(2).success).toBe(true);
      expect(zodSchema.safeParse(4).success).toBe(false);
    });

    it('should convert INTEGER with min/max to z.number().int().min().max()', () => {
      const input: VertexSchema = {
        type: SchemaType.INTEGER,
        description: 'An integer value',
        minimum: 0,
        maximum: 10,
      };
      const zodSchema = vertexSchemaToZod(input);
      expect(zodSchema).toBeInstanceOf(z.ZodNumber);
      expect(zodSchema._def.description).toBe('An integer value');

      // .int() check
      expect(zodSchema.safeParse(5).success).toBe(true);
      expect(zodSchema.safeParse(5.1).success).toBe(false);
    });
  });

  describe('Enum & Literal', () => {
    it('should convert multiple string enum => z.enum()', () => {
      const input: VertexSchema = {
        type: SchemaType.STRING,
        enum: ['RED', 'GREEN', 'BLUE'],
        description: 'Color enum',
      };
      const zodSchema = vertexSchemaToZod(input);
      expect(zodSchema).toBeInstanceOf(z.ZodEnum);
      expect(zodSchema._def.values).toEqual(['RED', 'GREEN', 'BLUE']);
      expect(zodSchema._def.description).toBe('Color enum');

      // Check parse
      expect(zodSchema.safeParse('RED').success).toBe(true);
      expect(zodSchema.safeParse('PURPLE').success).toBe(false);
    });

    it('should convert single string enum => z.literal()', () => {
      const input: VertexSchema = {
        type: SchemaType.STRING,
        enum: ['ONE_VALUE_ONLY'],
      };
      const zodSchema = vertexSchemaToZod(input);
      expect(zodSchema).toBeInstanceOf(z.ZodLiteral);
      expect(zodSchema._def.value).toBe('ONE_VALUE_ONLY');

      const valid = zodSchema.safeParse('ONE_VALUE_ONLY');
      const invalid = zodSchema.safeParse('foo');
      expect(valid.success).toBe(true);
      expect(invalid.success).toBe(false);
    });
  });

  describe('Objects', () => {
    it('should convert OBJECT with properties, required, optional', () => {
      const input: VertexSchema = {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING },
          age: { type: SchemaType.INTEGER },
          nick: { type: SchemaType.STRING },
        },
        required: ['name', 'age'],
        description: 'Person object',
      };

      const zodSchema = vertexSchemaToZod(input);
      // -- changed line:
      const shape = (zodSchema as z.ZodObject<any>).shape;

      expect(shape.name).toBeTruthy();
      expect(shape.age).toBeTruthy();
      expect(shape.nick).toBeTruthy();

      // name is required => no .optional()
      expect(shape.name.isOptional()).toBe(false);
      // nick is not in required => .optional()
      expect(shape.nick.isOptional()).toBe(true);

      // test .safeParse
      const valid = zodSchema.safeParse({ name: 'John', age: 25 });
      expect(valid.success).toBe(true);

      const missingName = zodSchema.safeParse({ age: 25 });
      expect(missingName.success).toBe(false);
    });

    it('should handle nested OBJECT definitions', () => {
      const input: VertexSchema = {
        type: SchemaType.OBJECT,
        description: 'Nested example',
        properties: {
          user: {
            type: SchemaType.OBJECT,
            properties: {
              id: { type: SchemaType.INTEGER },
              username: { type: SchemaType.STRING },
            },
            required: ['id'],
          },
        },
        required: ['user'],
      };

      const zodSchema = vertexSchemaToZod(input);
      // -- changed line:
      const shape = (zodSchema as z.ZodObject<any>).shape;
      expect(shape.user).toBeTruthy();

      const result = zodSchema.safeParse({
        user: { id: 1, username: 'test' },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Arrays', () => {
    it('should convert ARRAY with minItems, maxItems', () => {
      const input: VertexSchema = {
        type: SchemaType.ARRAY,
        description: 'Array of numbers',
        items: {
          type: SchemaType.NUMBER,
        },
        minItems: 1,
        maxItems: 3,
      };

      const zodSchema = vertexSchemaToZod(input);
      expect(zodSchema).toBeInstanceOf(z.ZodArray);

      // check .safeParse
      expect(zodSchema.safeParse([]).success).toBe(false);
      expect(zodSchema.safeParse([1]).success).toBe(true);
      expect(zodSchema.safeParse([1, 2, 3]).success).toBe(true);
      expect(zodSchema.safeParse([1, 2, 3, 4]).success).toBe(false);
    });

    it('should throw if ARRAY with no items', () => {
      const input: VertexSchema = {
        type: SchemaType.ARRAY,
      };
      expect(() => vertexSchemaToZod(input)).toThrowError(/ARRAY type schema must have 'items'/i);
    });
  });

  describe('Union (anyOf)', () => {
    it('should convert anyOf => z.union([...])', () => {
      const input: VertexSchema = {
        anyOf: [{ type: SchemaType.STRING }, { type: SchemaType.NUMBER }],
        description: 'Union of string or number',
      };

      const zodSchema = vertexSchemaToZod(input);
      expect(zodSchema).toBeInstanceOf(z.ZodUnion);
      expect(zodSchema._def.description).toBe('Union of string or number');

      // safeParse checks
      expect(zodSchema.safeParse('hello').success).toBe(true);
      expect(zodSchema.safeParse(123).success).toBe(true);
      expect(zodSchema.safeParse({}).success).toBe(false);
    });
  });

  describe('Nullable', () => {
    it('should attach .nullable() if schema.nullable = true', () => {
      const input: VertexSchema = {
        type: SchemaType.STRING,
        nullable: true,
      };
      const zodSchema = vertexSchemaToZod(input);
      const resultNull = zodSchema.safeParse(null);
      const resultString = zodSchema.safeParse('non-null');
      expect(resultNull.success).toBe(true);
      expect(resultString.success).toBe(true);
    });
  });

  describe('Round-Trip Check (zodToVertexSchema -> vertexSchemaToZod)', () => {
    /**
     * This test demonstrates going from a Zod schema -> VertexSchema -> back to Zod
     * and verifying the shapes are “compatible.” Because we are not necessarily doing
     * a 1:1 perfect mirror of all Zod details, it won't match 100% in some advanced
     * cases, but for basic scenarios, it should align.
     */
    it('should handle a simple object round-trip', () => {
      // 1) Original Zod schema
      const originalZod = z
        .object({
          name: z.string().describe('Name field'),
          age: z.number().min(10).max(100).describe('Age field'),
        })
        .describe('A user object');

      // 2) Convert to VertexSchema
      const vertex = zodToVertexSchema(originalZod);

      // 3) Convert back to Zod
      const reconstructedZod = vertexSchemaToZod(vertex);

      // 4) Test shape equivalences
      const validData = { name: 'Bob', age: 55 };
      const invalidData = { name: 'Bob', age: 9 };

      expect(originalZod.safeParse(validData).success).toBe(true);
      expect(reconstructedZod.safeParse(validData).success).toBe(true);

      expect(originalZod.safeParse(invalidData).success).toBe(false);
      expect(reconstructedZod.safeParse(invalidData).success).toBe(false);
    });
  });
});
