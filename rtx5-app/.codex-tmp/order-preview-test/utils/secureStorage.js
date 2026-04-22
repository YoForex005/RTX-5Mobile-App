"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeSecureItemAsync = exports.getSecureItemAsync = exports.setSecureItemAsync = void 0;
const SecureStore = __importStar(require("expo-secure-store"));
const async_storage_1 = __importDefault(require("@react-native-async-storage/async-storage"));
const react_native_1 = require("react-native");
/**
 * Platform-aware Secure Storage Wrapper.
 *
 * Uses Expo SecureStore (Keychain/Keystore) natively to meet security controls.
 * Falls back to AsyncStorage on Web where SecureStore is not natively supported,
 * preventing 'Cannot read properties of undefined' crashes.
 */
const setSecureItemAsync = async (key, value) => {
    if (react_native_1.Platform.OS === 'web') {
        await async_storage_1.default.setItem(key, value);
        return;
    }
    await SecureStore.setItemAsync(key, value);
};
exports.setSecureItemAsync = setSecureItemAsync;
const getSecureItemAsync = async (key) => {
    if (react_native_1.Platform.OS === 'web') {
        return await async_storage_1.default.getItem(key);
    }
    return await SecureStore.getItemAsync(key);
};
exports.getSecureItemAsync = getSecureItemAsync;
const removeSecureItemAsync = async (key) => {
    if (react_native_1.Platform.OS === 'web') {
        await async_storage_1.default.removeItem(key);
        return;
    }
    await SecureStore.deleteItemAsync(key);
};
exports.removeSecureItemAsync = removeSecureItemAsync;
