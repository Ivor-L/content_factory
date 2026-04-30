export default defineAppConfig({
  pages: [
    'pages/login/index',
    'pages/home/index',
    'pages/hot-square/index',
    'pages/asset-center/index',
    'pages/works/index',
    'pages/profile/index',
    'pages/warehouse/index',
    'pages/generate/index',
    'pages/records/index',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#fff',
    navigationBarTitleText: '小蚁AI',
    navigationBarTextStyle: 'black',
  },
  tabBar: {
    color: '#999999',
    selectedColor: '#4f46e5',
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
        pagePath: 'pages/hot-square/index',
        text: '爆款',
        iconPath: 'assets/icons/generate.png',
        selectedIconPath: 'assets/icons/generate-active.png',
      },
      {
        pagePath: 'pages/asset-center/index',
        text: '资产',
        iconPath: 'assets/icons/generate.png',
        selectedIconPath: 'assets/icons/generate-active.png',
      },
      {
        pagePath: 'pages/works/index',
        text: '作品',
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
