import {Schema} from "./schema";
import * as types from "../type/std";

export const FailsafeSchema = new Schema({
    explicit: [
        types.StrType,
        types.SeqType,
        types.MapType
    ]
});

export const JsonSchema = new Schema({
    include: [
        FailsafeSchema
    ],
    implicit: [
        types.NullType,
        types.BooleanType,
        types.IntType,
        types.FloatType
    ]
});

export const DefaultSafeSchema = new Schema({
    include: [
        JsonSchema
    ],
    implicit: [
        types.TimestampType,
        types.MergeType
    ],
    explicit: [
        //binary
        types.OMapType,
        types.PairsType,
        types.SetType
    ]
});

// TODO: Add js types.
export const DEFAULT_FULL       : Schema      = DefaultSafeSchema;
export const DEFAULT_SAFE       : Schema      = DefaultSafeSchema;
