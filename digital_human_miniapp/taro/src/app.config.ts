export default defineAppConfig({
  pages: [
    'pages/login/index',
    'pages/home/index',
    'pages/warehouse/index',
    'pages/generate/index',
    'pages/records/index',
    'pages/profile/index',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#fff',
    navigationBarTitleText: '数字人',
    navigationBarTextStyle: 'black',
  },
  tabBar: {
    color: '#999999',
    selectedColor: '#000000',
    backgroundColor: '#ffffff',
    borderStyle: 'white',
    list: [
      {
        pagePath: 'pages/home/index',
        text: '首页',
        iconPath: 'assets/icons/home.png',
        selectedIconPath: 'assets/icons/home-active.png',
      },
      {
        pagePath: 'pages/warehouse/index',
        text: '形象库',
        iconPath: 'assets/icons/warehouse.png',
        selectedIconPath: 'assets/icons/warehouse-active.png',
      },
      {
        pagePath: 'pages/generate/index',
        text: '生成',
        iconPath: 'assets/icons/generate.png',
        selectedIconPath: 'assets/icons/generate-active.png',
      },
      {
        pagePath: 'pages/records/index',
        text: '记录',
        iconPath: 'assets/icons/records.png',
        selectedIconPath: 'assets/icons/records-active.png',
      },
      {
        pagePath: 'pages/profile/index',
        text: '我的',
        iconPath: 'assets/icons/profile.png',
        selectedIconPath: 'assets/icons/profile-active.png',
      },
    ],
  },
});
