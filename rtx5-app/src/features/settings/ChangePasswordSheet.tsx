/**
 * Settings Feature UI: ChangePasswordSheet
 * 
 * Secure form component handling the rotation of either the Master or Investor 
 * (read-only) account passwords directly coordinating with the trading server.
 */

import { z } from 'zod';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing } from '../../ui/theme/index';
import { useTheme } from '../../ui/theme/useTheme';
import { ThemeColors } from '../../ui/theme/glass';
import { useMemo, useState } from 'react';
import { changePasswordAPI } from '../../api/auth';

const MAX_PASSWORD_LENGTH = 15;

const passwordSchema = z.object({
  oldPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string()
    .min(8, 'Must be at least 8 characters')
    .max(MAX_PASSWORD_LENGTH, `Must be at most ${MAX_PASSWORD_LENGTH} characters`)
    .regex(/[A-Z]/, 'Must contain at least 1 uppercase letter')
    .regex(/[a-z]/, 'Must contain at least 1 lowercase letter')
    .regex(/[0-9]/, 'Must contain at least 1 number')
    .regex(/[^A-Za-z0-9]/, 'Must contain at least 1 special character'),
});

type PasswordFormValues = z.infer<typeof passwordSchema>;

interface Props {
  loginId: string;
  type: 'master' | 'investor';
  onClose: () => void;
  onSuccess: () => void;
}

export function ChangePasswordSheet({ loginId, type, onClose, onSuccess }: Props) {
  const { control, handleSubmit, setError, formState: { errors } } = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
  });

  const [isPending, setIsPending] = useState(false);
  const T = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const insets = useSafeAreaInsets();

  const onSubmit = async (data: PasswordFormValues) => {
    setIsPending(true);
    try {
      await changePasswordAPI({
        current_password: data.oldPassword,
        new_password: data.newPassword,
      });
      onSuccess();
    } catch (err: any) {
      setError('root.serverError', {
        type: 'manual',
        message: err.message || 'Failed to change password',
      });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
      style={[styles.container, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}
    >
      <View style={styles.sheetHeader}>
        <Text style={styles.title}>Change {type === 'master' ? 'Master' : 'Investor'} Password</Text>
        <Pressable hitSlop={15} onPress={onClose} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color={T.textSub} />
        </Pressable>
      </View>

      <Text style={styles.subtitle}>
        For account #{loginId}. After a successful change, your old {type} password will stop working immediately.
      </Text>

      {errors.root?.serverError && (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={16} color={T.down} />
          <Text style={styles.errorText}>{errors.root.serverError.message}</Text>
        </View>
      )}

      <View style={styles.form}>
        <View style={styles.field}>
          <Text style={styles.label}>Current password</Text>
          <View style={styles.inputWrapper}>
            <Controller
              control={control}
              name="oldPassword"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={[styles.input, errors.oldPassword && styles.inputError]}
                  autoCapitalize="none"
                  secureTextEntry={!showOldPassword}
                  placeholder="Enter current password"
                  placeholderTextColor={T.textMuted}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                />
              )}
            />
            <Pressable onPress={() => setShowOldPassword(!showOldPassword)} hitSlop={15} style={styles.eyeBtn}>
              <Ionicons name={showOldPassword ? "eye-off-outline" : "eye-outline"} size={20} color={T.textMuted} />
            </Pressable>
          </View>
          {errors.oldPassword && <Text style={styles.fieldError}>{errors.oldPassword.message}</Text>}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>New password</Text>
          <View style={styles.inputWrapper}>
            <Controller
              control={control}
              name="newPassword"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={[styles.input, errors.newPassword && styles.inputError]}
                  autoCapitalize="none"
                  secureTextEntry={!showNewPassword}
                  maxLength={MAX_PASSWORD_LENGTH}
                  placeholder="Enter new password"
                  placeholderTextColor={T.textMuted}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                />
              )}
            />
            <Pressable onPress={() => setShowNewPassword(!showNewPassword)} hitSlop={15} style={styles.eyeBtn}>
              <Ionicons name={showNewPassword ? "eye-off-outline" : "eye-outline"} size={20} color={T.textMuted} />
            </Pressable>
          </View>
          {errors.newPassword && <Text style={styles.fieldError}>{errors.newPassword.message}</Text>}
          <Text style={styles.hintText}>Must be 8-15 characters with at least 1 uppercase, 1 lowercase, 1 number, and 1 special character.</Text>
        </View>

        <Pressable
          style={[styles.submitBtn, isPending && styles.submitBtnDisabled]}
          onPress={handleSubmit(onSubmit)}
          disabled={isPending}
        >
          {isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.submitBtnText}>Change Password</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (T: ThemeColors) => StyleSheet.create({
  container: {
    backgroundColor: T.glass2,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.md,
    paddingTop: 8,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: T.borderMedium,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    color: T.text,
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  subtitle: {
    color: T.textSub,
    fontSize: 13,
    marginBottom: 20,
    lineHeight: 18,
  },
  form: {
    gap: 16,
    paddingBottom: spacing.xl,
  },
  field: {
    gap: 6,
  },
  label: {
    color: T.text,
    fontSize: 13,
    fontWeight: '600',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.glass1,
    borderWidth: 1,
    borderColor: T.borderMedium,
    borderRadius: 12,
  },
  input: {
    flex: 1,
    color: T.text,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
  },
  eyeBtn: {
    padding: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputError: {
    borderColor: T.downGlow,
  },
  fieldError: {
    color: T.down,
    fontSize: 12,
    marginTop: 2,
  },
  hintText: {
    color: T.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  errorText: {
    color: T.down,
    fontSize: 13,
    flex: 1,
  },
  submitBtn: {
    backgroundColor: '#2563EB',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
