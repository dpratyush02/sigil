import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface StatCardProps {
  value: string | number;
  label: string;
  icon?: string;
  accent?: boolean;
}

export default function StatCard({ value, label, icon, accent }: StatCardProps) {
  return (
    <View style={s.card}>
      <Text style={s.label}>{label}</Text>
      <View style={s.row}>
        <Text style={[s.value, accent && s.valueAccent]}>{value}</Text>
        {icon && (
          <Ionicons
            name={icon as any}
            size={20}
            color={accent ? '#FACC15' : '#6B7280'}
            style={s.icon}
          />
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  label: {
    fontSize: 13,
    color: '#9CA3AF',
    fontWeight: '500',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  value: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 36,
  },
  valueAccent: {
    color: '#FACC15',
  },
  icon: {
    opacity: 0.9,
  },
});
