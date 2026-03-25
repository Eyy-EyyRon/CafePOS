import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Image, Dimensions, StatusBar } from 'react-native';
import { Slot } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

const { width: W } = Dimensions.get('window');
const isTablet = W >= 768;

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [animationFinished, setAnimationFinished] = useState(false);
  
  // Animation Values
  const logoScale = useRef(new Animated.Value(1.05)).current; // Start slightly zoomed in
  const logoOpacity = useRef(new Animated.Value(0)).current;  // Start invisible
  const finalTransition = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Hide static splash, start our custom sequence
    SplashScreen.hideAsync(); 

    Animated.sequence([
      // 1. Fade in the logo while gently zooming out
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.spring(logoScale, {
          toValue: 1,
          tension: 10,
          friction: 40,
          useNativeDriver: true,
        }),
      ]),
      
      // 2. Hold the logo for a moment so the user sees it
      Animated.delay(1200), 

      // 3. Start the transition to the dark app UI
      Animated.timing(finalTransition, {
        toValue: 1, 
        duration: 800,
        useNativeDriver: false, // False to allow background color interpolation
      }),
      Animated.delay(200),
    ]).start(() => {
      setAnimationFinished(true); // Load the actual app
    });
  }, []);

  if (!animationFinished) {
    return (
      <View style={styles.splashRoot}>
        <StatusBar barStyle="light-content" />

        {/* The Base Background Color (interpolates to dark navy) */}
        <Animated.View style={[
          styles.animatedBackground,
          {
            backgroundColor: finalTransition.interpolate({
              inputRange: [0, 1],
              outputRange: ['#F2F2F2', '#0F1923'] // Cream -> Dark App Background
            })
          }
        ]}>
          
          {/* The Actual Logo Image */}
          <Animated.View style={[
            styles.imageWrapper, 
            { 
              opacity: logoOpacity, 
              transform: [{ scale: logoScale }] 
            }
          ]}>
            <Image
                source={require('../assets/crema.jpg')}
                style={styles.cremaImage}
                resizeMode="contain" // Ensures the whole logo fits nicely
            />
            
            {/* The Dark Overlay: Fades in over the image to blend it into the dark background */}
            <Animated.View style={[
              styles.darkOverlay, 
              { opacity: finalTransition }
            ]} />
          </Animated.View>

        </Animated.View>
      </View>
    );
  }

  return <Slot />;
}

const styles = StyleSheet.create({
  splashRoot: { 
    flex: 1,
  },
  animatedBackground: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageWrapper: { 
    width: isTablet ? '60%' : '80%', // Scales perfectly on iPad vs Phone
    aspectRatio: 1, // Keeps the image square-ish
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  cremaImage: { 
    width: '100%', 
    height: '100%',
  },
  darkOverlay: { 
    position: 'absolute', 
    inset: 0, 
    backgroundColor: '#0F1923', // Matches the end state of the background
  },
});