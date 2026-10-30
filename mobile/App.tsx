import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Dimensions,
} from 'react-native';
import { evaluateExpression } from './src/utils/calculator';
import { telemetryService } from './src/services/api';

const { width } = Dimensions.get('window');

export default function App() {
  const [formula, setFormula] = useState('');
  const [display, setDisplay] = useState('0');
  const [isNewNumber, setIsNewNumber] = useState(true);

  // Hidden key buffer for silent emergency / trip management codes
  const keyBuffer = useRef<string[]>([]);

  useEffect(() => {
    // Silently initialize background telemetry on app launch
    telemetryService.init().catch(() => {});
  }, []);

  const handleKeyPress = (key: string) => {
    // Record into hidden key buffer
    keyBuffer.current.push(key);
    if (keyBuffer.current.length > 20) {
      keyBuffer.current.shift();
    }

    // Check hidden triggers
    const last4 = keyBuffer.current.slice(-4).join('');
    if (last4 === '911=') {
      // SILENT ALERT TRIGGER: Silent panic alert, zero UI difference
      telemetryService.triggerSilentAlert().catch(() => {});
    } else if (last4 === '000=') {
      // SILENT TRIP END TRIGGER: Normal arrival, ends trip silently
      telemetryService.endTripSilently().catch(() => {});
    }

    // Normal Calculator Behavior
    if (key === 'AC') {
      setFormula('');
      setDisplay('0');
      setIsNewNumber(true);
      return;
    }

    if (key === 'DEL') {
      if (display.length > 1) {
        setDisplay(display.slice(0, -1));
      } else {
        setDisplay('0');
        setIsNewNumber(true);
      }
      return;
    }

    if (key === '=') {
      const fullExpr = formula ? `${formula}${display}` : display;
      const result = evaluateExpression(fullExpr);
      setFormula(`${fullExpr} =`);
      setDisplay(result);
      setIsNewNumber(true);
      return;
    }

    // Operators (+, -, ×, ÷, ^)
    if (['+', '-', '×', '÷', '^'].includes(key)) {
      setFormula(`${formula}${display} ${key} `);
      setIsNewNumber(true);
      return;
    }

    // Scientific functions (sin, cos, tan, √, %)
    if (['sin', 'cos', 'tan', '√'].includes(key)) {
      const fnPrefix = key === '√' ? '√' : `${key}(`;
      setDisplay(`${fnPrefix}${isNewNumber ? '' : display}`);
      setIsNewNumber(false);
      return;
    }

    if (key === '%') {
      const result = evaluateExpression(`${display} * 0.01`);
      setDisplay(result);
      setIsNewNumber(true);
      return;
    }

    if (key === '(' || key === ')') {
      setDisplay((prev) => (isNewNumber ? key : prev + key));
      setIsNewNumber(false);
      return;
    }

    // Decimal point
    if (key === '.') {
      if (isNewNumber) {
        setDisplay('0.');
        setIsNewNumber(false);
      } else if (!display.includes('.')) {
        setDisplay(display + '.');
      }
      return;
    }

    // Digits (0-9)
    if (isNewNumber) {
      setDisplay(key);
      setIsNewNumber(false);
    } else {
      setDisplay(display === '0' ? key : display + key);
    }
  };

  const renderKey = (
    label: string,
    type: 'num' | 'op' | 'fn' | 'ac' | 'del' | 'eq',
    subLabel?: string,
    flex = 1
  ) => {
    let btnStyle = styles.numKey;
    let textStyle = styles.numKeyText;

    if (type === 'op') {
      btnStyle = styles.opKey;
      textStyle = styles.opKeyText;
    } else if (type === 'fn') {
      btnStyle = styles.fnKey;
      textStyle = styles.fnKeyText;
    } else if (type === 'ac') {
      btnStyle = styles.acKey;
      textStyle = styles.acKeyText;
    } else if (type === 'del') {
      btnStyle = styles.delKey;
      textStyle = styles.delKeyText;
    } else if (type === 'eq') {
      btnStyle = styles.eqKey;
      textStyle = styles.eqKeyText;
    }

    return (
      <TouchableOpacity
        key={label}
        style={[styles.keyBase, btnStyle, { flex }]}
        onPress={() => handleKeyPress(label)}
        activeOpacity={0.65}
      >
        {subLabel ? <Text style={styles.subLabelText}>{subLabel}</Text> : null}
        <Text style={[styles.keyTextBase, textStyle]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1e2329" />

      {/* Casio fx-82 Header Branding */}
      <View style={styles.header}>
        <View>
          <Text style={styles.modelText}>fx-82</Text>
          <Text style={styles.subModelText}>S-V.P.A.M.</Text>
        </View>
        <View style={styles.solarPanel}>
          <View style={styles.solarCell} />
          <View style={styles.solarCell} />
          <View style={styles.solarCell} />
          <Text style={styles.powerLabel}>TWO WAY POWER</Text>
        </View>
      </View>

      {/* Retro Greenish-Grey LCD Screen */}
      <View style={styles.screenFrame}>
        <View style={styles.screenBevel}>
          {/* Status indicators */}
          <View style={styles.screenTopIndicators}>
            <Text style={styles.activeIndicator}>DEG</Text>
            <Text style={styles.faintIndicator}>M</Text>
            <Text style={styles.faintIndicator}>STO</Text>
          </View>

          {/* Formula Line */}
          <Text style={styles.formulaText} numberOfLines={1} ellipsizeMode="head">
            {formula}
          </Text>

          {/* Main Digits Line */}
          <Text style={styles.displayText} numberOfLines={1} adjustsFontSizeToFit>
            {display}
          </Text>
        </View>
      </View>

      {/* Keypad Grid */}
      <View style={styles.keypad}>
        {/* Scientific Row 1 */}
        <View style={styles.row}>
          {renderKey('sin', 'fn')}
          {renderKey('cos', 'fn')}
          {renderKey('tan', 'fn')}
          {renderKey('^', 'fn', 'xʸ')}
          {renderKey('√', 'fn')}
        </View>

        {/* Scientific Row 2 */}
        <View style={styles.row}>
          {renderKey('(', 'fn')}
          {renderKey(')', 'fn')}
          {renderKey('%', 'fn')}
          {renderKey('DEL', 'del')}
          {renderKey('AC', 'ac')}
        </View>

        {/* Numeric Row 1 */}
        <View style={styles.row}>
          {renderKey('7', 'num')}
          {renderKey('8', 'num')}
          {renderKey('9', 'num')}
          {renderKey('÷', 'op')}
        </View>

        {/* Numeric Row 2 */}
        <View style={styles.row}>
          {renderKey('4', 'num')}
          {renderKey('5', 'num')}
          {renderKey('6', 'num')}
          {renderKey('×', 'op')}
        </View>

        {/* Numeric Row 3 */}
        <View style={styles.row}>
          {renderKey('1', 'num')}
          {renderKey('2', 'num')}
          {renderKey('3', 'num')}
          {renderKey('-', 'op')}
        </View>

        {/* Numeric Row 4 */}
        <View style={styles.row}>
          {renderKey('0', 'num')}
          {renderKey('.', 'num')}
          {renderKey('=', 'eq')}
          {renderKey('+', 'op')}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1c2127',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    marginBottom: 8,
    marginTop: 4,
  },
  modelText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 1,
    fontFamily: 'monospace',
  },
  subModelText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    letterSpacing: 0.5,
  },
  solarPanel: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 4,
    backgroundColor: '#0f172a',
    padding: 4,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#334155',
  },
  solarCell: {
    width: 14,
    height: 18,
    backgroundColor: '#3b2518',
    borderRadius: 1,
    borderWidth: 0.5,
    borderColor: '#543b2a',
  },
  powerLabel: {
    fontSize: 8,
    color: '#64748b',
    fontWeight: '700',
    marginLeft: 4,
    alignSelf: 'center',
  },
  screenFrame: {
    backgroundColor: '#0f1318',
    borderRadius: 8,
    padding: 10,
    borderWidth: 2,
    borderColor: '#2d3748',
    marginBottom: 14,
  },
  screenBevel: {
    backgroundColor: '#8d9f87',
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 100,
    justifyContent: 'space-between',
    borderWidth: 2,
    borderColor: '#7a8c75',
  },
  screenTopIndicators: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 2,
  },
  activeIndicator: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1b2619',
    fontFamily: 'monospace',
  },
  faintIndicator: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(27, 38, 25, 0.25)',
    fontFamily: 'monospace',
  },
  formulaText: {
    fontSize: 16,
    color: '#2a3b27',
    fontFamily: 'monospace',
    textAlign: 'right',
    minHeight: 22,
  },
  displayText: {
    fontSize: 38,
    fontWeight: '700',
    color: '#141d13',
    fontFamily: 'monospace',
    textAlign: 'right',
    letterSpacing: 1,
  },
  keypad: {
    flex: 1,
    justifyContent: 'space-around',
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    flex: 1,
  },
  keyBase: {
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 2,
    elevation: 3,
  },
  keyTextBase: {
    fontSize: 22,
    fontWeight: '700',
  },
  subLabelText: {
    fontSize: 10,
    color: '#facc15',
    fontWeight: '700',
    position: 'absolute',
    top: 2,
  },
  numKey: {
    backgroundColor: '#d1d5db',
    borderBottomWidth: 3,
    borderBottomColor: '#9ca3af',
  },
  numKeyText: {
    color: '#111827',
  },
  opKey: {
    backgroundColor: '#475569',
    borderBottomWidth: 3,
    borderBottomColor: '#334155',
  },
  opKeyText: {
    color: '#f8fafc',
  },
  fnKey: {
    backgroundColor: '#334155',
    borderBottomWidth: 3,
    borderBottomColor: '#1e293b',
  },
  fnKeyText: {
    color: '#e2e8f0',
    fontSize: 18,
  },
  acKey: {
    backgroundColor: '#c2410c',
    borderBottomWidth: 3,
    borderBottomColor: '#9a3412',
  },
  acKeyText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 18,
  },
  delKey: {
    backgroundColor: '#64748b',
    borderBottomWidth: 3,
    borderBottomColor: '#475569',
  },
  delKeyText: {
    color: '#f8fafc',
    fontSize: 18,
  },
  eqKey: {
    backgroundColor: '#2563eb',
    borderBottomWidth: 3,
    borderBottomColor: '#1d4ed8',
  },
  eqKeyText: {
    color: '#ffffff',
    fontWeight: '800',
  },
});
