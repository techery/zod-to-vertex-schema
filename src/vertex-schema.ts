export enum SchemaType {
  /** String type. */
  STRING = 'STRING',
  /** Number type. */
  NUMBER = 'NUMBER',
  /** Integer type. */
  INTEGER = 'INTEGER',
  /** Boolean type. */
  BOOLEAN = 'BOOLEAN',
  /** Array type. */
  ARRAY = 'ARRAY',
  /** Object type. */
  OBJECT = 'OBJECT',
}

/**
 * Schema is used to define the format of input/output data.
 * Represents a select subset of an OpenAPI 3.0 schema object.
 * More fields may be added in the future as needed.
 */
export interface VertexSchema {
  /**
   * Optional. The type of the property. {@link
   * SchemaType}.
   */
  type?: SchemaType;
  /** Optional. The format of the property. */
  format?: string;
  /** Optional. The description of the property. */
  description?: string;
  /** Optional. Whether the property is nullable. */
  nullable?: boolean;
  /** Optional. The items of the property. {@link Schema} */
  items?: VertexSchema;
  /** Optional. The enum of the property. */
  enum?: string[];
  /** Optional. Map of {@link Schema}. */
  properties?: {
    [k: string]: VertexSchema;
  };
  /** Optional. Array of required property. */
  required?: string[];
  /** Optional. The example of the property. */
  example?: unknown;

  /** Optional. Array of property names in the order they should be displayed. */
  propertyOrdering?: string[];
  /** Optional. Array of schemas that this schema can be any of. */
  anyOf?: VertexSchema[];
  /** Optional. Minimum number of items in an array. */
  minItems?: number;
  /** Optional. Maximum number of items in an array. */
  maxItems?: number;
  /** Optional. Minimum value for a number. */
  minimum?: number;
  /** Optional. Maximum value for a number. */
  maximum?: number;
}
