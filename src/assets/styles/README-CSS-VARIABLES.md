# CSS Variables Best Practices

## مشکل و راه حل

### ❌ مشکل قبلی:
```scss
:root {
  --ti-window-width: #{$scss-variable}; // ممکن است undefined شود
}

.component {
  width: var(--ti-window-width); // بدون fallback
}
```

### ✅ راه حل اصولی:

## 1. استفاده از Mixin برای CSS Properties

```scss
@mixin css-properties($prefix: 'ti', $properties: ()) {
  @each $name, $value in $properties {
    --#{$prefix}-#{$name}: #{$value};
  }
}
```

## 2. Function امن برای CSS Variables

```scss
@function css-var($name, $fallback: null) {
  @if $fallback {
    @return var(--ti-#{$name}, #{$fallback});
  } @else {
    @return var(--ti-#{$name});
  }
}
```

## 3. استفاده صحیح:

```scss
// تعریف متغیرها
:root {
  @include css-properties('ti', (
    'window-width': $selection-window-max-width,
    'window-padding': $spacing-md
  ));
}

// استفاده امن
.component {
  width: #{css-var('window-width', 300px)};
  padding: #{css-var('window-padding', 16px)};
}
```

## مزایا:

1. **Type Safety**: اگر SCSS variable وجود نداشته باشد، خطا می‌دهد
2. **Fallback Guarantee**: همیشه مقدار پشتیبان دارد
3. **Maintainable**: یک جا تغییر کنید، همه جا اعمال می‌شود
4. **Future Proof**: قابل گسترش برای پروژه‌های آینده

## نحوه استفاده در آینده:

```scss
// در _mixins.scss
@mixin new-component-vars {
  @include css-properties('ti', (
    'component-width': $component-width,
    'component-height': $component-height
  ));
}

// در component.scss
:root {
  @include new-component-vars;
}

.new-component {
  width: #{css-var('component-width', 200px)};
  height: #{css-var('component-height', 100px)};
}
```