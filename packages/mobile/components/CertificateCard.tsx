import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { CertificateData, formatWalletAddress, getVerifyUrl } from '../utils/certificate';

interface CertificateCardProps {
  certificate: CertificateData;
}

export default function CertificateCard({ certificate }: CertificateCardProps) {
  const handleShare = async () => {
    try {
      await Share.share({
        message: `SIGIL OWNERSHIP CLAIM\n\nContent: "${certificate.contentName}"\nClaimant: ${formatWalletAddress(certificate.ownerWallet)}\nClaim Date: ${certificate.registrationDate}\nChain: ${certificate.chain}\nTX: ${certificate.txHash.slice(0, 20)}...\n\nVerify: ${getVerifyUrl(certificate.txHash)}\n\nNOTE: This is a timestamped blockchain claim, not a legal determination of copyright ownership.`,
        title: `SIGIL Claim Record — ${certificate.contentName}`,
      });
    } catch {}
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.sigilBadge}>
          <Ionicons name="shield" size={16} color={Colors.primary} />
          <Text style={styles.sigilTitle}>OWNERSHIP CLAIM</Text>
        </View>
        <Ionicons name="checkmark-circle" size={24} color={Colors.primary} />
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Content */}
      <View style={styles.row}>
        <Text style={styles.fieldLabel}>Content</Text>
        <Text style={styles.fieldValue}>{certificate.contentName}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.fieldLabel}>Type</Text>
        <Text style={styles.fieldValue}>{certificate.contentType}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.fieldLabel}>Claimant</Text>
        <Text style={[styles.fieldValue, styles.mono]}>{formatWalletAddress(certificate.ownerWallet)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.fieldLabel}>Claim Date</Text>
        <Text style={styles.fieldValue}>{certificate.registrationDate}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.fieldLabel}>Chain</Text>
        <Text style={styles.fieldValue}>{certificate.chain}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.fieldLabel}>TX</Text>
        <Text style={[styles.fieldValue, styles.mono]} numberOfLines={1}>
          {certificate.txHash.slice(0, 14)}...{certificate.txHash.slice(-6)}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.fieldLabel}>Watermark</Text>
        <Text style={[styles.fieldValue, styles.mono, styles.watermark]}>{certificate.watermark}</Text>
      </View>
      {certificate.licenseType && certificate.licenseType !== 'none' && (
        <View style={styles.row}>
          <Text style={styles.fieldLabel}>License</Text>
          <Text style={styles.fieldValue}>{certificate.licenseType}</Text>
        </View>
      )}
      {certificate.contentHash && (
        <View style={styles.row}>
          <Text style={styles.fieldLabel}>Hash</Text>
          <Text style={[styles.fieldValue, styles.mono]} numberOfLines={1}>
            {certificate.contentHash.slice(0, 12)}...{certificate.contentHash.slice(-8)}
          </Text>
        </View>
      )}

      {/* Footer */}
      <View style={styles.divider} />
      <Text style={styles.footer}>
        Timestamped ownership claim on Polygon Mainnet.{'\n'}Not a legal determination of copyright ownership.
      </Text>
      <Text style={styles.url}>{getVerifyUrl(certificate.txHash)}</Text>

      {/* Share */}
      <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
        <Ionicons name="share-outline" size={16} color={Colors.onPrimary} />
        <Text style={styles.shareText}>Share Certificate</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.cardElevated,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.primary + '44',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sigilBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sigilIcon: {
    fontSize: 20,
  },
  sigilTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primary,
    letterSpacing: 1,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    flex: 1,
  },
  fieldValue: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.onSurface,
    flex: 2,
    textAlign: 'right',
  },
  mono: {
    fontFamily: 'monospace' as any,
    fontSize: 11,
  },
  watermark: {
    color: Colors.primary,
  },
  footer: {
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
  url: {
    fontSize: 10,
    color: Colors.primary,
    textAlign: 'center',
    marginTop: 4,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 99,
    paddingVertical: 12,
    marginTop: 12,
  },
  shareText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.onPrimary,
  },
});
